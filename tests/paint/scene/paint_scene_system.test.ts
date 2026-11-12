import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaintAtlas } from '@/paint/bake/paint_atlas.js';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/**
 * Builds a world with one 4 m floor slab whose top is painted.
 *
 * @returns Parts.
 */
function paintedWorld(): {
  world: THREE.Group;
  scene: THREE.Scene;
  model: SolidModel;
  system: PaintSceneSystem;
} {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const model = new SolidModel('Floor');
  world.add(model.root);
  const floor = model.addBoxBrush(4, SolidOperation.Additive);
  floor.paint.add(
    testFloorStroke(
      'footsteps',
      1,
      [
        [-0.5, 2, 0],
        [0, 2, 0],
        [0.5, 2, 0],
      ],
      { radius: 0.2 },
    ),
  );
  model.rebuild(true);
  const system = new PaintSceneSystem(scene, () => world, PAINT_IMAGE_SOURCE_NONE);
  return { world, scene, model, system };
}

/**
 * Returns the overlay meshes in a scene.
 *
 * @param scene Scene.
 * @returns Meshes of the multiply pass.
 */
function overlayTriangles(scene: THREE.Scene): number {
  let triangles = 0;
  scene.getObjectByName('paint_overlays')?.traverse((object) => {
    if (object instanceof THREE.Mesh && object.renderOrder % 2 === 0) {
      triangles += (object.geometry.getAttribute('position')?.count ?? 0) / 3;
    }
  });
  return triangles;
}

/**
 * Returns the bounds of the overlay in world space.
 *
 * @param scene Scene.
 * @returns Box.
 */
function overlayBounds(scene: THREE.Scene): THREE.Box3 {
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.getObjectByName('paint_overlays')?.traverse((object) => {
    if (object instanceof THREE.Mesh) box.expandByObject(object);
  });
  return box;
}

/**
 * Returns whether an overlay triangle covers a floor point.
 *
 * @param scene Scene.
 * @param x World x.
 * @param z World z.
 * @returns True when paint is drawn there.
 */
function overlayCovers(scene: THREE.Scene, x: number, z: number): boolean {
  let covered = false;
  const triangle = new THREE.Triangle();
  const point = new THREE.Vector3(x, 0, z);
  scene.updateMatrixWorld(true);
  scene.getObjectByName('paint_overlays')?.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.renderOrder % 2 !== 0) return;
    const position = object.geometry.getAttribute('position');
    if (position === undefined) return;
    for (let index = 0; index < position.count; index += 3) {
      triangle.setFromAttributeAndIndices(position, index, index + 1, index + 2);
      triangle.a.applyMatrix4(object.matrixWorld).setY(0);
      triangle.b.applyMatrix4(object.matrixWorld).setY(0);
      triangle.c.applyMatrix4(object.matrixWorld).setY(0);
      if (triangle.containsPoint(point)) covered = true;
    }
  });
  return covered;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Paint scene system', () => {
  it('bakes painted brushes and draws them on the result', () => {
    const { scene, system } = paintedWorld();
    system.update();
    expect(system.atlas.tileCount).toBeGreaterThan(0);
    expect(overlayTriangles(scene)).toBeGreaterThan(0);
    const bounds = overlayBounds(scene);
    expect(bounds.min.y).toBeCloseTo(2);
    expect(bounds.max.y).toBeCloseTo(2);
  });

  it('keeps paint on the brush when it moves, without rebaking', () => {
    const { scene, model, system } = paintedWorld();
    system.update();
    const tiles = system.atlas.tileCount;
    const version = system.atlas.version;
    const brush = model.getBrushes()[0];
    brush?.mesh?.position.set(10, 0, 0);
    brush?.pullTransformFromMesh();
    model.markBrushesDirty([brush?.id ?? '']);
    model.rebuild(true);
    system.update();
    expect(system.atlas.tileCount).toBe(tiles);
    expect(system.atlas.version).toBe(version);
    const bounds = overlayBounds(scene);
    expect(bounds.min.x).toBeGreaterThan(8);
  });

  it('follows CSG: a hole removes the painted surface and undoing it brings the paint back', () => {
    const { scene, model, system } = paintedWorld();
    system.update();
    const before = overlayTriangles(scene);
    expect(overlayCovers(scene, 0.05, 0.05)).toBe(true);
    expect(overlayCovers(scene, 0.55, 0.05)).toBe(true);
    const hole = model.addBoxBrush(1, SolidOperation.Subtractive);
    hole.mesh?.position.set(0, 2, 0);
    hole.pullTransformFromMesh();
    model.markBrushesDirty([hole.id]);
    model.rebuild(true);
    system.update();
    expect(overlayCovers(scene, 0.05, 0.05)).toBe(false);
    expect(overlayCovers(scene, 0.55, 0.05)).toBe(true);
    expect(system.atlas.tileCount).toBeGreaterThan(0);
    model.removeBrush(hole.id, true, true);
    model.rebuild(true);
    system.update();
    expect(overlayTriangles(scene)).toBe(before);
    expect(overlayCovers(scene, 0.05, 0.05)).toBe(true);
  });

  it('finds the facing of a hole painted after the floor, as a fresh system does', () => {
    const { world, scene, model, system } = paintedWorld();
    const hole = model.addBoxBrush(1, SolidOperation.Subtractive);
    hole.mesh?.position.set(0, 1.6, 0);
    hole.pullTransformFromMesh();
    model.markBrushesDirty([hole.id]);
    model.rebuild(true);
    system.update();
    const bakes = vi.spyOn(PaintAtlas.prototype, 'bakeBrush');
    // The pit floor at y = 1.1 is the hole's bottom face, seen flipped.
    hole.paint.add(testFloorStroke('pit', 2, [[0, 1.1, 0]], { radius: 0.2 }));
    system.update();
    const signs = (calls: typeof bakes.mock.calls): number[] =>
      calls
        .filter(([input]) => input.brushId.endsWith(hole.id))
        .flatMap(([input]) => input.faces.map((face) => face.facingSign));
    const late = signs(bakes.mock.calls);
    expect(late).toContain(-1);
    bakes.mockClear();
    const fresh = new PaintSceneSystem(scene, () => world, PAINT_IMAGE_SOURCE_NONE);
    fresh.update();
    expect(late).toEqual(signs(bakes.mock.calls));
    fresh.dispose();
  });

  it('frees tiles and overlays when the paint is removed', () => {
    const { scene, model, system } = paintedWorld();
    system.update();
    model.getBrushes()[0]?.paint.clear();
    system.update();
    expect(system.atlas.tileCount).toBe(0);
    expect(overlayTriangles(scene)).toBe(0);
  });

  it('shows a stroke in progress and keeps its tiles once committed', () => {
    const { model, system } = paintedWorld();
    system.update();
    const brush = model.getBrushes()[0];
    if (brush === undefined) throw new Error('missing brush');
    const tiles = system.atlas.tileCount;
    const live = testFloorStroke('live', 2, [[1.5, 2, 1.5]], { radius: 0.2 });
    system.previewSet(model, brush, [live]);
    system.update();
    expect(system.atlas.tileCount).toBeGreaterThan(tiles);
    const version = system.atlas.version;
    brush.paint.add(live);
    system.previewSet(model, brush, []);
    system.update();
    expect(system.atlas.version).toBe(version);
  });

  it('releases a stroke in progress that is cancelled', () => {
    const { model, system } = paintedWorld();
    system.update();
    const brush = model.getBrushes()[0];
    if (brush === undefined) throw new Error('missing brush');
    const tiles = system.atlas.tileCount;
    system.previewSet(model, brush, [testFloorStroke('live', 2, [[1.5, 2, 1.5]], { radius: 0.2 })]);
    system.update();
    system.previewSet(model, brush, []);
    system.update();
    expect(system.atlas.tileCount).toBe(tiles);
  });
});
