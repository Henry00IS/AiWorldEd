import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import type { PaintTileLayer, PaintTileRaster } from '@/paint/raster/paint_tile_raster.js';
import type { PaintLayerProvider } from '@/paint/scene/paint_scene_system.js';
import { paintExportBake, paintExportPack, type PaintExportBakeOptions } from '@/paint/export/paint_export_bake.js';
import { testFloorStroke } from '../paint_test_strokes.js';

const OPTIONS: PaintExportBakeOptions = { images: PAINT_IMAGE_SOURCE_NONE, layers: null, baseImage: () => null };

/**
 * Builds a 4 m box (top at y = 2) and its export copy with a gray material.
 *
 * @param painted True paints a red dab on the top.
 * @returns Model, result and export copy.
 */
function boxExport(painted: boolean): { model: SolidModel; result: THREE.Mesh; exported: THREE.Mesh } {
  const model = new SolidModel('Box');
  const brush = model.addBoxBrush(4, SolidOperation.Additive);
  if (painted) brush.paint.add(testFloorStroke('dab', 1, [[0, 2, 0]], { radius: 0.5 }));
  model.rebuild(true);
  const result = model.getResultMesh();
  const exported = new THREE.Mesh(result.geometry, new THREE.MeshPhysicalMaterial({ color: 0x808080, name: 'Stone' }));
  exported.name = 'Box';
  return { model, result, exported };
}

/**
 * Counts pixels of an image matching a predicate.
 *
 * @param texture Data texture.
 * @param match Predicate on r, g, b.
 * @returns Count.
 */
function countPixels(texture: THREE.DataTexture, match: (r: number, g: number, b: number) => boolean): number {
  const data = texture.image.data as Uint8Array;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (match(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0)) count++;
  }
  return count;
}

describe('Paint export bake', () => {
  it('leaves unpainted models untouched', () => {
    const { model, result, exported } = boxExport(false);
    const geometry = exported.geometry;
    expect(paintExportBake(model, result, exported, OPTIONS)).toBe(false);
    expect(exported.geometry).toBe(geometry);
  });

  it('moves painted faces to a new material whose map holds base color and paint', () => {
    const { model, result, exported } = boxExport(true);
    const original = result.geometry;
    const originalUv = Array.from(original.getAttribute('uv').array);
    expect(paintExportBake(model, result, exported, OPTIONS)).toBe(true);
    expect(result.geometry).toBe(original);
    expect(Array.from(original.getAttribute('uv').array)).toEqual(originalUv);
    const materials = exported.material as THREE.MeshPhysicalMaterial[];
    expect(materials).toHaveLength(2);
    expect(materials[0]?.map ?? null).toBeNull();
    const painted = materials[1];
    expect(painted?.name).toBe('Stone Painted');
    expect(painted?.color.getHex()).toBe(0xffffff);
    const map = painted?.map as THREE.DataTexture;
    expect(map).toBeInstanceOf(THREE.DataTexture);
    expect(map.name).toBe('Box_painted');
    expect(countPixels(map, (r, g, b) => r > 250 && g < 5 && b < 5)).toBeGreaterThan(100);
    expect(countPixels(map, (r, g, b) => r === 128 && g === 128 && b === 128)).toBeGreaterThan(1000);
    const groups = exported.geometry.groups;
    const paintedGroup = groups.find((group) => group.materialIndex === 1);
    expect(paintedGroup?.count).toBe(6);
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(original.getAttribute('position').count);
    const uv = exported.geometry.getAttribute('uv');
    for (let vertex = paintedGroup?.start ?? 0; vertex < (paintedGroup?.start ?? 0) + 6; vertex++) {
      expect(uv.getX(vertex)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(vertex)).toBeLessThanOrEqual(1);
      expect(uv.getY(vertex)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(vertex)).toBeLessThanOrEqual(1);
    }
  });

  it('bakes layers such as decals on brushes without paint of their own', () => {
    const { model, result, exported } = boxExport(false);
    const blue: PaintTileLayer = {
      composite(raster: PaintTileRaster): boolean {
        for (let index = 0; index < raster.count; index++) {
          const x = raster.points[index * 3] ?? 0;
          const z = raster.points[index * 3 + 2] ?? 0;
          if (Math.abs(x) > 0.5 || Math.abs(z) > 0.5) continue;
          raster.affineA.fill(0, index * 3, index * 3 + 3);
          raster.affineB.set([0, 0, 1], index * 3);
        }
        return false;
      },
    };
    const top = new THREE.Box3(new THREE.Vector3(-0.5, 1.9, -0.5), new THREE.Vector3(0.5, 2.1, 0.5));
    const layers: PaintLayerProvider = {
      layersFor: (_model, brush) => ({
        signature: 'blue',
        bounds: [top],
        layers: (face) => ((brush.brush.planes[face]?.normal.y ?? 0) > 0.5 ? [blue] : []),
      }),
    };
    expect(paintExportBake(model, result, exported, { ...OPTIONS, layers })).toBe(true);
    const materials = exported.material as THREE.MeshPhysicalMaterial[];
    const map = materials[1]?.map as THREE.DataTexture;
    expect(countPixels(map, (r, g, b) => r === 0 && g === 0 && b === 255)).toBeGreaterThan(100);
    expect(countPixels(map, (r, g, b) => r === 128 && g === 128 && b === 128)).toBeGreaterThan(1000);
  });

  it('places the dab where the new UVs say it is', () => {
    const { model, result, exported } = boxExport(true);
    paintExportBake(model, result, exported, OPTIONS);
    const geometry = exported.geometry;
    const group = geometry.groups.find((entry) => entry.materialIndex === 1);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const map = (exported.material as THREE.MeshPhysicalMaterial[])[1]?.map as THREE.DataTexture;
    // Interpolate the UV of the top center (0, 2, 0) from the painted quad's corners.
    const corners: { x: number; z: number; u: number; v: number }[] = [];
    for (let vertex = group?.start ?? 0; vertex < (group?.start ?? 0) + 6; vertex++) {
      corners.push({ x: position.getX(vertex), z: position.getZ(vertex), u: uv.getX(vertex), v: uv.getY(vertex) });
    }
    const minX = corners.reduce((best, corner) => (corner.x < best.x ? corner : best));
    const maxX = corners.reduce((best, corner) => (corner.x > best.x ? corner : best));
    const u = (minX.u + maxX.u) / 2;
    const v = corners.reduce((sum, corner) => sum + corner.v, 0) / corners.length;
    const width = map.image.width;
    const height = map.image.height;
    const x = Math.floor(u * width);
    const y = Math.floor((1 - v) * height);
    const data = map.image.data as Uint8Array;
    const index = (y * width + x) * 4;
    expect([data[index], data[index + 1], data[index + 2]]).toEqual([255, 0, 0]);
  });

  it('shrinks charts that would not fit and never overlaps them', () => {
    const charts = [
      { width: 3000, height: 2000, x: 0, y: 0 },
      { width: 2500, height: 2500, x: 0, y: 0 },
      { width: 100, height: 100, x: 0, y: 0 },
    ];
    const packing = paintExportPack(charts, 2048);
    expect(packing.scale).toBeLessThan(1);
    expect(packing.width).toBeLessThanOrEqual(2048);
    expect(packing.height).toBeLessThanOrEqual(2048);
    const boxes = charts.map((chart) => ({
      x0: chart.x,
      y0: chart.y,
      x1: chart.x + Math.ceil(chart.width * packing.scale),
      y1: chart.y + Math.ceil(chart.height * packing.scale),
    }));
    for (const box of boxes) {
      expect(box.x1).toBeLessThanOrEqual(packing.width);
      expect(box.y1).toBeLessThanOrEqual(packing.height);
    }
    for (let left = 0; left < boxes.length; left++) {
      for (let right = left + 1; right < boxes.length; right++) {
        const a = boxes[left]!;
        const b = boxes[right]!;
        expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true);
      }
    }
    expect(paintExportPack([{ width: 10, height: 10, x: 0, y: 0 }], 2048).scale).toBe(1);
  });
});
