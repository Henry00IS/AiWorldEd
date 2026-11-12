import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierStackCopySourceMatrix } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import { paintCopyTargets } from '@/paint/scene/paint_copy_targets.js';
import { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import { paintExportBake } from '@/paint/export/paint_export_bake.js';
import { paintCopyCenter, paintCopyDecal, paintCopyDerived, paintCopyFixture } from './paint_copy_fixture.js';

/**
 * Lists the overlay vertex positions of a scene's paint overlays.
 *
 * @param scene Scene.
 * @returns Positions.
 */
function overlayPoints(scene: THREE.Scene): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  scene.getObjectByName('paint_overlays')?.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.name === 'paint_overlay') return;
    const position = object.geometry.getAttribute('position');
    if (position === undefined) return;
    for (let index = 0; index < position.count; index++) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld));
    }
  });
  return points;
}

/**
 * Expects every vertex of a copy to be its source vertex moved by the copy's
 * recorded source matrix.
 *
 * @param root Solid root.
 * @param source Authored brush.
 * @param source.brush Brush shape.
 * @param count Expected number of copies.
 */
function expectSourceMatrices(
  root: THREE.Object3D,
  source: { brush: { vertices: THREE.Vector3[] } },
  count: number,
): void {
  const copies = paintCopyDerived(root);
  expect(copies).toHaveLength(count);
  for (const copy of copies) {
    const matrix = modifierStackCopySourceMatrix(copy);
    expect(matrix).not.toBeNull();
    source.brush.vertices.forEach((vertex, index) => {
      const moved = vertex.clone().applyMatrix4(matrix ?? new THREE.Matrix4());
      expect(moved.distanceTo(copy.brush.vertices[index] ?? new THREE.Vector3(1e9, 0, 0))).toBeLessThan(1e-5);
    });
  }
}

describe('Paint on modifier copies', () => {
  it('records how each array and mirror copy was placed from its authored brush', () => {
    const mirror = paintCopyFixture(['mirror']);
    expectSourceMatrices(mirror.model.root, mirror.source, 1);
    const copy = paintCopyDerived(mirror.model.root)[0];
    expect(modifierStackCopySourceMatrix(copy!)?.determinant()).toBeLessThan(0);
    const chained = paintCopyFixture([{ kind: 'linear', parameters: { count: 2 } }, 'mirror']);
    expectSourceMatrices(chained.model.root, chained.source, 3);
  });

  it('lists the copies of a model as paint targets of their authored brush', () => {
    const { model, source } = paintCopyFixture([{ kind: 'linear', parameters: { count: 3 } }]);
    const targets = paintCopyTargets(model);
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.source).toBe(source);
      expect(target.id).toContain('#');
      expect(target.sourceToModel.determinant()).toBeCloseTo(1);
    }
  });

  it('projects decal volumes onto mirror copies without touching the original', () => {
    const { world, model, source } = paintCopyFixture(['mirror']);
    const copy = paintCopyDerived(model.root)[0]!;
    const copyTop = paintCopyCenter(copy).setY(0.8);
    const scene = new THREE.Scene();
    scene.add(world);
    const decal = paintCopyDecal(world, copyTop);
    const system = new PaintSceneSystem(scene, () => world, PAINT_IMAGE_SOURCE_NONE);
    system.setLayerProvider(new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE));
    system.update();
    scene.updateMatrixWorld(true);
    const points = overlayPoints(scene);
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.distanceTo(copyTop)).toBeLessThan(0.75);
    }
    decal.position.copy(paintCopyCenter(source).add(source.mesh!.position).setY(0.8));
    world.updateMatrixWorld(true);
    system.update();
    scene.updateMatrixWorld(true);
    const moved = overlayPoints(scene);
    expect(moved.length).toBeGreaterThan(0);
    for (const point of moved) expect(point.x).toBeGreaterThan(0);
    system.dispose();
  });

  it('bakes decals on copies into the export', () => {
    const { world, model } = paintCopyFixture([{ kind: 'linear', parameters: { count: 2 } }]);
    const copy = paintCopyDerived(model.root)[0]!;
    paintCopyDecal(world, paintCopyCenter(copy).setY(0.8));
    const result = model.getResultMesh();
    const exported = new THREE.Mesh(result.geometry, new THREE.MeshPhysicalMaterial({ color: 0x808080 }));
    const baked = paintExportBake(model, result, exported, {
      images: PAINT_IMAGE_SOURCE_NONE,
      layers: new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE),
      baseImage: () => null,
    });
    expect(baked).toBe(true);
    const materials = exported.material as unknown as THREE.MeshPhysicalMaterial[];
    const map = materials[1]?.map as THREE.DataTexture;
    const data = map.image.data as Uint8Array;
    let blue = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index + 2] === 255 && data[index] === 0) blue++;
    expect(blue).toBeGreaterThan(100);
    const painted = exported.geometry.groups.find((group) => group.materialIndex === 1);
    const position = exported.geometry.getAttribute('position');
    const center = paintCopyCenter(copy);
    for (let vertex = painted!.start; vertex < painted!.start + painted!.count; vertex++) {
      expect(Math.abs(position.getX(vertex) - center.x)).toBeLessThan(0.51);
    }
  });
});
