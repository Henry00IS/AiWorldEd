import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/** A small scene with one brush that gets dragged. */
interface ReplayScene {
  world: THREE.Group;
  model: SolidModel;
  dragged: SolidBrushInstance;
}

/**
 * Adds a box brush with a pose.
 *
 * @param model Target model.
 * @param operation CSG operation.
 * @param position Center.
 * @param scale Edge lengths.
 * @param rotationY Yaw in radians.
 * @returns Created brush.
 */
function addBox(
  model: SolidModel,
  operation: SolidOperation,
  position: THREE.Vector3,
  scale: THREE.Vector3,
  rotationY: number,
): SolidBrushInstance {
  const brush = model.addBoxBrush(1, operation, null, false);
  brush.position.copy(position);
  brush.scale.copy(scale);
  brush.rotation.set(0, rotationY, 0);
  brush.pushTransformToMesh();
  return brush;
}

/**
 * Adds a floor, a wall and a field of mostly subtractive cutters.
 *
 * @param model Target model.
 */
function addStaticBrushes(model: SolidModel): void {
  addBox(model, SolidOperation.Additive, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(16, 1, 16), 0);
  addBox(model, SolidOperation.Additive, new THREE.Vector3(0, 1, 4), new THREE.Vector3(16, 3, 1), 0);
  for (let index = 0; index < 12; index++) {
    const position = new THREE.Vector3(-6 + index, -0.2 + (index % 3) * 0.3, -2 + (index % 4) * 1.6);
    addBox(
      model,
      index % 4 === 3 ? SolidOperation.Additive : SolidOperation.Subtractive,
      position,
      new THREE.Vector3(1.3, 1.1, 1.7),
      index * 0.37,
    );
  }
}

/**
 * Builds a floor with walls, a field of overlapping subtractive cutters, and a
 * subtractive brush that is dragged across them (placed last in order).
 *
 * @returns Scene after a full rebuild.
 */
function buildScene(): ReplayScene {
  const world = new THREE.Group();
  const model = new SolidModel('replay');
  world.add(model.root);
  addStaticBrushes(model);
  const dragged = addBox(
    model,
    SolidOperation.Subtractive,
    new THREE.Vector3(-5, 0, 0),
    new THREE.Vector3(2.2, 1.6, 5.5),
    0.1,
  );
  world.updateMatrixWorld(true);
  model.syncBrushesFromScene();
  model.syncBrushOrderFromScene();
  model.markDirty();
  model.rebuild(true);
  return { world, model, dragged };
}

/**
 * Returns the dragged brush pose for a frame.
 *
 * @param frame Frame number.
 * @returns Position.
 */
function poseAt(frame: number): THREE.Vector3 {
  return new THREE.Vector3(-5 + 0.31 * frame, 0.02 * Math.sin(frame), 0.4 * Math.cos(frame * 0.5));
}

/**
 * Moves the dragged brush to a frame pose.
 *
 * @param scene Scene.
 * @param frame Frame number.
 */
function moveTo(scene: ReplayScene, frame: number): void {
  scene.dragged.mesh?.position.copy(poseAt(frame));
  scene.world.updateMatrixWorld(true);
}

/**
 * Lists result triangles as sorted text, so the comparison ignores only the
 * order in which brushes were written into the result buffer.
 *
 * @param model Model.
 * @returns Sorted triangle descriptions.
 */
function resultPositions(model: SolidModel): string[] {
  const attribute = model.getResultMesh().geometry.getAttribute('position');
  const triangles: string[] = [];
  if (!attribute) return triangles;
  const values = Array.from(attribute.array as ArrayLike<number>);
  for (let start = 0; start + 9 <= values.length; start += 9) triangles.push(values.slice(start, start + 9).join(','));
  return triangles.sort();
}

/**
 * Fully recompiles a model from scratch and returns its result triangles.
 *
 * @param model Model.
 * @returns Result triangles of the full rebuild.
 */
function fullRebuildPositions(model: SolidModel): string[] {
  model.markDirty();
  model.rebuild(true);
  return resultPositions(model);
}

/**
 * Replaying and resuming faces during drags gives exactly the full-rebuild
 * result.
 */
describe('SolidSurfaceReplayFaceEmitter', () => {
  it('live drag frames and the end of the drag equal a full rebuild of the same state', () => {
    const scene = buildScene();
    const meshes = scene.dragged.mesh ? [scene.dragged.mesh] : [];
    const locks = { positionLock: true, stretchLock: true };
    for (let frame = 1; frame <= 24; frame++) {
      moveTo(scene, frame);
      scene.model.prepareLiveBrushEdit(meshes, locks);
      scene.model.rebuildLive();
      if (frame % 8 === 0) {
        const live = resultPositions(scene.model);
        expect(fullRebuildPositions(scene.model)).toEqual(live);
      }
    }
    scene.model.prepareLiveBrushEdit(meshes, locks);
    scene.model.finalizeAfterInteractiveEdit();
    const finalized = resultPositions(scene.model);
    expect(finalized.length).toBeGreaterThan(0);
    expect(fullRebuildPositions(scene.model)).toEqual(finalized);
  });
});
