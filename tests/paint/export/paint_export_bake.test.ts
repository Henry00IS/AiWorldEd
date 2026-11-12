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

/** A triangle of an exported mesh. */
interface ExportTriangle {
  readonly material: number;
  readonly corners: THREE.Vector3[];
  readonly uvs: THREE.Vector2[];
}

/**
 * Lists the triangles of an exported mesh with their materials.
 *
 * @param mesh Exported mesh.
 * @returns Triangles.
 */
function exportTriangles(mesh: THREE.Mesh): ExportTriangle[] {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const triangles: ExportTriangle[] = [];
  for (const group of geometry.groups) {
    for (let vertex = group.start; vertex < group.start + group.count; vertex += 3) {
      triangles.push({
        material: group.materialIndex ?? 0,
        corners: [0, 1, 2].map((corner) => new THREE.Vector3().fromBufferAttribute(position, vertex + corner)),
        uvs: [0, 1, 2].map((corner) => new THREE.Vector2().fromBufferAttribute(uv, vertex + corner)),
      });
    }
  }
  return triangles;
}

/**
 * Returns the area of a triangle.
 *
 * @param triangle Triangle.
 * @returns Area.
 */
function triangleArea(triangle: ExportTriangle): number {
  const [a, b, c] = triangle.corners as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  return new THREE.Triangle(a, b, c).getArea();
}

/**
 * Reads the baked image at a world point on the painted triangles.
 *
 * @param mesh Exported mesh.
 * @param point World point on a painted face.
 * @returns RGB, or null when no painted triangle covers it.
 */
function bakedColorAt(mesh: THREE.Mesh, point: THREE.Vector3): number[] | null {
  const map = (mesh.material as THREE.MeshPhysicalMaterial[])[1]?.map as THREE.DataTexture | undefined;
  if (map === undefined) return null;
  for (const triangle of exportTriangles(mesh)) {
    if (triangle.material !== 1) continue;
    const [a, b, c] = triangle.corners as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const weights = new THREE.Triangle(a, b, c).getBarycoord(point, new THREE.Vector3());
    if (weights === null || Math.min(weights.x, weights.y, weights.z) < -1e-6) continue;
    const [ua, ub, uc] = triangle.uvs as [THREE.Vector2, THREE.Vector2, THREE.Vector2];
    const u = ua.x * weights.x + ub.x * weights.y + uc.x * weights.z;
    const v = ua.y * weights.x + ub.y * weights.y + uc.y * weights.z;
    const x = Math.floor(u * map.image.width);
    const y = Math.floor((1 - v) * map.image.height);
    const data = map.image.data as Uint8Array;
    const index = (y * map.image.width + x) * 4;
    return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
  }
  return null;
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
    const triangles = exportTriangles(exported);
    const total = triangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0);
    expect(total).toBeCloseTo(6 * 16, 4);
    const paintedTriangles = triangles.filter((triangle) => triangle.material === 1);
    expect(paintedTriangles.length).toBeGreaterThan(0);
    for (const triangle of paintedTriangles) {
      for (const uv of triangle.uvs) {
        expect(uv.x).toBeGreaterThanOrEqual(0);
        expect(uv.x).toBeLessThanOrEqual(1);
        expect(uv.y).toBeGreaterThanOrEqual(0);
        expect(uv.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('exports only the painted patches and keeps the rest of the face on its material', () => {
    const { model, result, exported } = boxExport(false);
    const brush = model.getBrushes()[0]!;
    brush.paint.add(testFloorStroke('screw-a', 1, [[-1.5, 2, -1.5]], { radius: 0.1 }));
    brush.paint.add(testFloorStroke('screw-b', 2, [[1.5, 2, 1.5]], { radius: 0.1 }));
    expect(paintExportBake(model, result, exported, OPTIONS)).toBe(true);
    const map = (exported.material as THREE.MeshPhysicalMaterial[])[1]?.map as THREE.DataTexture;
    // The whole 4 m face would need 512 x 512 texels.
    expect(map.image.width * map.image.height).toBeLessThan(0.1 * 512 * 512);
    const triangles = exportTriangles(exported);
    const top = triangles.filter((triangle) => triangle.corners.every((corner) => Math.abs(corner.y - 2) < 1e-6));
    expect(top.reduce((sum, triangle) => sum + triangleArea(triangle), 0)).toBeCloseTo(16, 4);
    const painted = top.filter((triangle) => triangle.material === 1);
    const paintedArea = painted.reduce((sum, triangle) => sum + triangleArea(triangle), 0);
    expect(paintedArea).toBeGreaterThan(2 * 0.2 * 0.2);
    expect(paintedArea).toBeLessThan(0.5);
    const screws = [new THREE.Vector3(-1.5, 2, -1.5), new THREE.Vector3(1.5, 2, 1.5)];
    for (const triangle of painted) {
      const center = triangle.corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(3);
      expect(Math.min(...screws.map((screw) => screw.distanceTo(center)))).toBeLessThan(0.3);
    }
    for (const screw of screws) expect(bakedColorAt(exported, screw)).toEqual([255, 0, 0]);
    expect(bakedColorAt(exported, new THREE.Vector3(0, 2, 0))).toBeNull();
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

  it('leaves no cracks: no vertex of the export lies inside another triangle edge', () => {
    const { model, result, exported } = boxExport(false);
    const brush = model.getBrushes()[0]!;
    brush.paint.add(testFloorStroke('screw-a', 1, [[-1.2, 2, -0.9]], { radius: 0.1 }));
    brush.paint.add(testFloorStroke('screw-b', 2, [[1.5, 2, 1.1]], { radius: 0.1 }));
    paintExportBake(model, result, exported, OPTIONS);
    const triangles = exportTriangles(exported);
    const vertices = triangles.flatMap((triangle) => triangle.corners);
    const closest = new THREE.Vector3();
    for (const triangle of triangles) {
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle.corners[edge]!;
        const b = triangle.corners[(edge + 1) % 3]!;
        const segment = new THREE.Line3(a, b);
        for (const vertex of vertices) {
          if (vertex.distanceTo(a) < 1e-5 || vertex.distanceTo(b) < 1e-5) continue;
          segment.closestPointToPoint(vertex, true, closest);
          expect(closest.distanceTo(vertex)).toBeGreaterThan(1e-5);
        }
      }
    }
  });

  it('places the dab where the new UVs say it is', () => {
    const { model, result, exported } = boxExport(true);
    paintExportBake(model, result, exported, OPTIONS);
    expect(bakedColorAt(exported, new THREE.Vector3(0, 2, 0))).toEqual([255, 0, 0]);
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
