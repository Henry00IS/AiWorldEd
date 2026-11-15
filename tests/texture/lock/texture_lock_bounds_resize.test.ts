import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { TransformMode } from '@/types/transform_mode.js';
import { BoundsFace } from '@/types/bounds_face.js';
import { computeOneSidedMeshResize } from '@/transform/bounds/bounds_resize_math.js';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { restoreTransformTextureState } from '@/transform/commands/state_transform_texture.js';
import { TransformDragSession } from '@/transform/core/session_transform_drag.js';

/**
 * A bounds resize pulls one face out and keeps the opposite face still. With
 * Stretch Lock off the texture must stay fixed in the world, and with it on the
 * texture must stretch with the geometry, no matter where the object origin
 * sits and whether the resized object is a brush or a CSG group.
 */
describe('texture locks under a one-sided bounds resize', () => {
  it('keeps world UVs on a brush whose origin is far from its geometry when Stretch Lock is off', () => {
    const scene = buildScene({ positionLock: true, stretchLock: false });
    const brush = addOffsetBrush(scene.model, scene.model.root, new THREE.Vector3(3, 0.5, -2));
    const samples = sampleTopFacePoints(scene, brush.mesh!);
    const before = samples.map((point) => worldUvOnTopFace(scene.model, brush, point));
    resizeObjectAlongPositiveX(scene, brush.mesh!, 1.5);
    const after = samples.map((point) => worldUvOnTopFace(scene.model, brush, point));
    expectUvListsClose(after, before);
  });

  it('stretches UVs with the geometry of a brush whose origin is far from its geometry when Stretch Lock is on', () => {
    const scene = buildScene({ positionLock: true, stretchLock: true });
    const brush = addOffsetBrush(scene.model, scene.model.root, new THREE.Vector3(3, 0.5, -2));
    const fractions = [new THREE.Vector2(0.2, 0.3), new THREE.Vector2(0.8, 0.7)];
    const before = fractions.map((f) => worldUvOnTopFace(scene.model, brush, topFacePointAt(scene, brush.mesh!, f)));
    resizeObjectAlongPositiveX(scene, brush.mesh!, 1.5);
    const after = fractions.map((f) => worldUvOnTopFace(scene.model, brush, topFacePointAt(scene, brush.mesh!, f)));
    expectUvListsClose(after, before);
  });

  it('keeps world UVs through live drag frames when another system reads the brush pose first', () => {
    const scene = buildScene({ positionLock: true, stretchLock: false });
    const brush = addOffsetBrush(scene.model, scene.model.root, new THREE.Vector3(3, 0.5, -2));
    const samples = sampleTopFacePoints(scene, brush.mesh!);
    const before = samples.map((point) => worldUvOnTopFace(scene.model, brush, point));
    resizeObjectLiveAlongPositiveX(scene, brush.mesh!, [1.25, 1.5, 2]);
    const after = samples.map((point) => worldUvOnTopFace(scene.model, brush, point));
    expectUvListsClose(after, before);
  });

  it('keeps world UVs of brushes inside a resized CSG group when Stretch Lock is off', () => {
    const scene = buildScene({ positionLock: true, stretchLock: false });
    const group = addGroup(scene.model, new THREE.Vector3(-1, 0, 1));
    const additive = addOffsetBrush(scene.model, group, new THREE.Vector3(0.5, 0.5, 0));
    const intersect = addOffsetBrush(scene.model, group, new THREE.Vector3(0.75, 0.75, 0), SolidOperation.Intersecting);
    const samples = sampleTopFacePoints(scene, intersect.mesh!);
    const beforeIntersect = samples.map((point) => worldUvOnTopFace(scene.model, intersect, point));
    const beforeAdditive = samples.map((point) => worldUvOnTopFace(scene.model, additive, point));
    resizeObjectAlongPositiveX(scene, group, 2);
    expectUvListsClose(
      samples.map((point) => worldUvOnTopFace(scene.model, intersect, point)),
      beforeIntersect,
    );
    expectUvListsClose(
      samples.map((point) => worldUvOnTopFace(scene.model, additive, point)),
      beforeAdditive,
    );
  });

  it('bakes result UVs of a brush inside a moved and resized CSG group from its full group pose', () => {
    const scene = buildScene({ positionLock: true, stretchLock: true });
    const group = addGroup(scene.model, new THREE.Vector3(-1, 0, 1));
    const brush = addOffsetBrush(scene.model, group, new THREE.Vector3(0.5, 0.5, 0));
    resizeObjectAlongPositiveX(scene, group, 2);
    expect(worstResultTopUvError(scene.model, brush)).toBeLessThan(1e-4);
  });

  it('restores the UVs of brushes inside a resized CSG group on undo', () => {
    const scene = buildScene({ positionLock: true, stretchLock: false });
    const group = addGroup(scene.model, new THREE.Vector3(-1, 0, 1));
    const brush = addOffsetBrush(scene.model, group, new THREE.Vector3(0.5, 0.5, 0));
    const before = brush.serializeFaceSurfaces();
    const session = resizeObjectAlongPositiveX(scene, group, 2);
    expect(brush.serializeFaceSurfaces()).not.toEqual(before);
    restoreTransformTextureState(session.initialTextureState);
    expect(brush.serializeFaceSurfaces()).toEqual(before);
  });
});

interface LockScene {
  world: THREE.Group;
  model: SolidModel;
  controller: SolidModelController;
}

/**
 * Builds a world with one solid and a controller in bounds mode.
 *
 * @param locks Texture lock flags for the controller.
 * @returns Scene parts.
 */
function buildScene(locks: { positionLock: boolean; stretchLock: boolean }): LockScene {
  const world = new THREE.Group();
  const host = document.createElement('div');
  const panel = new SolidModelPanel(host, { onAddBrush: () => undefined }, host);
  const controller = new SolidModelController(world, new CommandStack(16), new ManagerSelection(), panel);
  controller.setTransformModeProvider(() => TransformMode.BOUNDS);
  controller.setTextureLockSettings(new TextureLockSettings(locks.positionLock, locks.stretchLock));
  const model = new SolidModel('LockModel');
  world.add(model.root);
  world.updateMatrixWorld(true);
  return { world, model, controller };
}

/**
 * Adds a CSG group to the solid at a position.
 *
 * @param model Solid model.
 * @param position Group position.
 * @returns The group.
 */
function addGroup(model: SolidModel, position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  markAsSolidCsgGroup(group);
  group.position.copy(position);
  model.root.add(group);
  return group;
}

/**
 * Adds a unit box brush whose geometry sits away from its origin.
 *
 * @param model Solid model.
 * @param parent Solid root or CSG group.
 * @param geometryOffset Offset from the brush origin to the box center.
 * @param operation CSG operation.
 * @returns The brush.
 */
function addOffsetBrush(
  model: SolidModel,
  parent: THREE.Object3D,
  geometryOffset: THREE.Vector3,
  operation: SolidOperation = SolidOperation.Additive,
): SolidBrushInstance {
  const box = SolidBrushFactory.createCenteredBox(1, 1, 1);
  box.transformVertices(new THREE.Matrix4().makeTranslation(geometryOffset.x, geometryOffset.y, geometryOffset.z));
  const brush = new SolidBrushInstance(`b${model.getBrushCount()}`, `Brush${model.getBrushCount()}`, box, operation);
  model.addBrushInstance(brush);
  parent.add(brush.mesh!);
  model.syncBrushesFromScene();
  model.root.updateMatrixWorld(true);
  return brush;
}

/**
 * Resizes an object with the one-sided bounds math along world +X, then commits
 * it through the solid controller the way a bounds drag does.
 *
 * @param scene Scene parts.
 * @param object Object to resize.
 * @param factor Growth factor of the bounds along X.
 * @returns The drag session holding the pre-drag texture state.
 */
function resizeObjectAlongPositiveX(scene: LockScene, object: THREE.Object3D, factor: number): TransformDragSession {
  const box = worldBoxOf(scene, object);
  const bounds: DataOrientedBounds = {
    center: box.getCenter(new THREE.Vector3()),
    quaternion: new THREE.Quaternion(),
    halfExtents: box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
  };
  const session = new TransformDragSession();
  session.snapshotPreDragState([object]);
  const delta = bounds.halfExtents.x * 2 * (factor - 1);
  const result = computeOneSidedMeshResize(object.position, object.scale, bounds, BoundsFace.POS_X, delta);
  object.position.copy(result.position);
  object.scale.copy(result.scale);
  scene.world.updateMatrixWorld(true);
  scene.controller.onTransformsCommitted([object as THREE.Mesh]);
  return session;
}

/**
 * Resizes an object over several live drag frames along world +X. Before each
 * live rebuild a pose read (as wireframe tracking does) pulls the mesh pose
 * into the brush, then the drag commits.
 *
 * @param scene Scene parts.
 * @param object Object to resize.
 * @param factors Growth factors of the bounds along X, one per frame.
 */
function resizeObjectLiveAlongPositiveX(scene: LockScene, object: THREE.Object3D, factors: number[]): void {
  const box = worldBoxOf(scene, object);
  const bounds: DataOrientedBounds = {
    center: box.getCenter(new THREE.Vector3()),
    quaternion: new THREE.Quaternion(),
    halfExtents: box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
  };
  const startPosition = object.position.clone();
  const startScale = object.scale.clone();
  new TransformDragSession().snapshotPreDragState([object]);
  const locks = scene.controller.getTextureLockFlagsForActiveTransform();
  for (const factor of factors) {
    const delta = bounds.halfExtents.x * 2 * (factor - 1);
    const result = computeOneSidedMeshResize(startPosition, startScale, bounds, BoundsFace.POS_X, delta);
    object.position.copy(result.position);
    object.scale.copy(result.scale);
    scene.world.updateMatrixWorld(true);
    object.traverse((child) => scene.model.findBrushByMesh(child)?.getModelSpaceBrush());
    scene.model.prepareLiveBrushEdit([object as THREE.Mesh], locks);
  }
  scene.controller.onTransformsCommitted([object as THREE.Mesh]);
}

/**
 * World box of an object's brush meshes.
 *
 * @param scene Scene parts.
 * @param object Object to measure.
 * @returns World box.
 */
function worldBoxOf(scene: LockScene, object: THREE.Object3D): THREE.Box3 {
  scene.world.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverse((child) => {
    const brush = scene.model.findBrushByMesh(child);
    if (!brush) return;
    for (const vertex of brush.brush.vertices) {
      box.expandByPoint(vertex.clone().applyMatrix4(child.matrixWorld));
    }
  });
  return box;
}

/**
 * Picks world points on the top face of an object's bounds.
 *
 * @param scene Scene parts.
 * @param object Object.
 * @returns World points.
 */
function sampleTopFacePoints(scene: LockScene, object: THREE.Object3D): THREE.Vector3[] {
  return [new THREE.Vector2(0.25, 0.25), new THREE.Vector2(0.6, 0.8)].map((f) => topFacePointAt(scene, object, f));
}

/**
 * Returns the world point on the bounds top face at fractions along X and Z.
 *
 * @param scene Scene parts.
 * @param object Object.
 * @param fraction Fraction along X (x) and Z (y).
 * @returns World point.
 */
function topFacePointAt(scene: LockScene, object: THREE.Object3D, fraction: THREE.Vector2): THREE.Vector3 {
  const box = worldBoxOf(scene, object);
  return new THREE.Vector3(
    THREE.MathUtils.lerp(box.min.x, box.max.x, fraction.x),
    box.max.y,
    THREE.MathUtils.lerp(box.min.z, box.max.z, fraction.y),
  );
}

/**
 * Projects a world point with a brush's top face UV matrix.
 *
 * @param model Solid model.
 * @param brush Brush.
 * @param world World point.
 * @returns UV pair.
 */
function worldUvOnTopFace(model: SolidModel, brush: SolidBrushInstance, world: THREE.Vector3): THREE.Vector2 {
  model.root.updateMatrixWorld(true);
  const localToWorld = model.root.matrixWorld.clone().multiply(brush.getModelSpaceMatrix());
  const local = world.clone().applyMatrix4(localToWorld.invert());
  const faceIndex = brush.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
  const uv = brush.getFaceSurface(faceIndex).uv.project(local);
  return new THREE.Vector2(uv.u, uv.v);
}

/**
 * Largest difference between the baked result UVs on the top face and the UVs
 * the brush's top face surface gives at the same points.
 *
 * @param model Solid model holding only the brush.
 * @param brush Brush whose top face is checked.
 * @returns Largest UV error.
 */
function worstResultTopUvError(model: SolidModel, brush: SolidBrushInstance): number {
  const geometry = model.getResultMesh().geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  const modelToLocal = brush.getModelSpaceMatrix().clone().invert();
  const faceIndex = brush.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
  let worst = 0;
  let checked = 0;
  for (let index = 0; index < positions.count; index++) {
    if (normals.getY(index) < 0.9) continue;
    const local = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(modelToLocal);
    const expected = brush.getFaceSurface(faceIndex).uv.project(local);
    worst = Math.max(worst, Math.hypot(uvs.getX(index) - expected.u, uvs.getY(index) - expected.v));
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
  return worst;
}

/**
 * Expects two UV lists to match.
 *
 * @param actual Measured UVs.
 * @param expected Reference UVs.
 */
function expectUvListsClose(actual: THREE.Vector2[], expected: THREE.Vector2[]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((uv, index) => {
    expect(uv.distanceTo(expected[index]!)).toBeLessThan(1e-4);
  });
}
