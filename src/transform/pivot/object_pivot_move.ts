import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import {
  bakeMeshGeometry,
  captureMeshSnapshot,
  restoreObjectApplyMeshSnapshot,
  type ObjectApplyMeshSnapshot,
} from '@/transform/apply/object_apply_transform_mesh.js';
import {
  captureBrushSnapshot,
  compensateBrushFaceUvMatricesForBake,
  restoreObjectApplyBrushSnapshot,
  syncBrushPresentation,
  type ObjectApplyBrushSnapshot,
} from '@/transform/apply/object_apply_transform_brush.js';

/** Undo state of a group whose origin moved. */
interface ObjectPivotGroupSnapshot {
  kind: 'group';
  group: THREE.Object3D;
  position: THREE.Vector3;
  children: Array<{ child: THREE.Object3D; position: THREE.Vector3 }>;
}

/** Undo state of one origin move. */
export type ObjectPivotSnapshot =
  | { kind: 'mesh'; snapshot: ObjectApplyMeshSnapshot }
  | { kind: 'brush'; snapshot: ObjectApplyBrushSnapshot }
  | ObjectPivotGroupSnapshot;

/**
 * Moves an object's origin to a world point; its geometry, children and face
 * textures stay where they are in the world.
 *
 * @param object Mesh, brush or group.
 * @param point World point for the origin.
 * @returns Undo state.
 */
export function objectPivotMove(object: THREE.Object3D, point: THREE.Vector3): ObjectPivotSnapshot {
  const model = SolidModel.fromObject(object);
  const brush =
    SolidBrushVisual.isBrushObject(object) && object instanceof THREE.Mesh ? model?.findBrushByMesh(object) : null;
  if (model && brush) return { kind: 'brush', snapshot: objectPivotMoveBrush(model, brush, point) };
  if (object instanceof THREE.Mesh && !isResultMesh(object)) {
    return { kind: 'mesh', snapshot: objectPivotMoveMesh(object, point) };
  }
  return objectPivotMoveGroup(object, point);
}

/**
 * Restores the state before an origin move.
 *
 * @param state Undo state.
 */
export function objectPivotRestore(state: ObjectPivotSnapshot): void {
  if (state.kind === 'mesh') return restoreObjectApplyMeshSnapshot(state.snapshot);
  if (state.kind === 'brush') return restoreObjectApplyBrushSnapshot(state.snapshot);
  state.group.position.copy(state.position);
  state.children.forEach((entry) => entry.child.position.copy(entry.position));
  objectPivotGroupRefresh(state.group);
}

/**
 * Moves a content mesh origin and shifts its vertices back.
 *
 * @param mesh Mesh.
 * @param point World point.
 * @returns Undo state.
 */
function objectPivotMoveMesh(mesh: THREE.Mesh, point: THREE.Vector3): ObjectApplyMeshSnapshot {
  const snapshot = captureMeshSnapshot(mesh);
  const local = objectPivotLocalPosition(mesh, point);
  bakeMeshGeometry(mesh, objectPivotBakeMatrix(mesh, local), snapshot.usedDocument);
  mesh.position.copy(local);
  mesh.updateMatrixWorld(true);
  return snapshot;
}

/**
 * Moves a brush origin, shifting its vertices and face UV mappings back.
 *
 * @param model Solid model.
 * @param instance Brush.
 * @param point World point.
 * @returns Undo state.
 */
function objectPivotMoveBrush(
  model: SolidModel,
  instance: SolidBrushInstance,
  point: THREE.Vector3,
): ObjectApplyBrushSnapshot {
  instance.pullTransformFromMesh();
  const snapshot = captureBrushSnapshot(model, instance);
  const mesh = instance.mesh!;
  const local = objectPivotLocalPosition(mesh, point);
  const bake = objectPivotBakeMatrix(mesh, local);
  instance.brush.transformVertices(bake);
  compensateBrushFaceUvMatricesForBake(instance, bake);
  instance.position.copy(local);
  instance.pushTransformToMesh();
  syncBrushPresentation(model, instance);
  return snapshot;
}

/**
 * Moves a group origin and shifts its children back.
 *
 * @param group Group.
 * @param point World point.
 * @returns Undo state.
 */
function objectPivotMoveGroup(group: THREE.Object3D, point: THREE.Vector3): ObjectPivotGroupSnapshot {
  const children = group.children.filter((child) => !isResultMesh(child));
  const snapshot: ObjectPivotGroupSnapshot = {
    kind: 'group',
    group,
    position: group.position.clone(),
    children: children.map((child) => ({ child, position: child.position.clone() })),
  };
  const local = objectPivotLocalPosition(group, point);
  const bake = objectPivotBakeMatrix(group, local);
  children.forEach((child) => child.position.applyMatrix4(bake));
  group.position.copy(local);
  objectPivotGroupRefresh(group);
  return snapshot;
}

/**
 * Updates matrices and rebuilds the brushes inside a group after its origin
 * moved.
 *
 * @param group Group.
 */
function objectPivotGroupRefresh(group: THREE.Object3D): void {
  group.updateMatrixWorld(true);
  const model = SolidModel.fromObject(group);
  if (!model) return;
  const ids: string[] = [];
  group.traverse((child) => {
    const brush = child instanceof THREE.Mesh ? model.findBrushByMesh(child) : null;
    if (!brush) return;
    brush.pullTransformFromMesh();
    ids.push(brush.id);
  });
  if (ids.length > 0) model.markBrushesDirty(ids);
}

/**
 * Converts a world point into the object's parent space.
 *
 * @param object Object.
 * @param point World point.
 * @returns Local position for the origin.
 */
function objectPivotLocalPosition(object: THREE.Object3D, point: THREE.Vector3): THREE.Vector3 {
  const local = point.clone();
  if (object.parent === null) return local;
  object.parent.updateWorldMatrix(true, false);
  return local.applyMatrix4(object.parent.matrixWorld.clone().invert());
}

/**
 * Builds the matrix that keeps geometry in place when the origin moves to a new
 * local position: inv(new pose) * old pose.
 *
 * @param object Object.
 * @param local New local position.
 * @returns Matrix for the object's own geometry or children.
 */
function objectPivotBakeMatrix(object: THREE.Object3D, local: THREE.Vector3): THREE.Matrix4 {
  object.updateMatrix();
  const next = new THREE.Matrix4().compose(local, object.quaternion, object.scale);
  return next.invert().multiply(object.matrix);
}
