import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { markSolidBrushConvexityState } from '@/edit/transform/brush_edit_convexity.js';
import { cloneFaceSurface, type FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { ObjectApplyTransformFlags } from './object_apply_transform_flags.js';
import {
  buildObjectApplyBakeMatrix,
  captureObjectLocalPose,
  type ObjectLocalPoseSnapshot,
} from './object_apply_transform_matrix.js';

/** Undo payload for one solid brush apply. */
export interface ObjectApplyBrushSnapshot {
  solidModel: SolidModel;
  brushId: string;
  pose: ObjectLocalPoseSnapshot;
  vertices: THREE.Vector3[];
  faceSurfaces: FaceSurfaceDescription[];
}

/**
 * Bakes selected local transform channels into brush vertices and clears them
 * on the brush instance / preview mesh. Face UV matrices are right-multiplied
 * by inv(bake) so projected UVs stay the same after vertices absorb the pose.
 *
 * @param solidModel Owning solid model.
 * @param instance Brush instance.
 * @param flags Channels to bake.
 * @returns Snapshot for undo, or null when nothing changed.
 */
export function applyObjectTransformToSolidBrush(
  solidModel: SolidModel,
  instance: SolidBrushInstance,
  flags: ObjectApplyTransformFlags,
): ObjectApplyBrushSnapshot | null {
  if (!hasAnyApplyFlag(flags)) {
    return null;
  }
  const mesh = instance.mesh;
  if (mesh) {
    instance.pullTransformFromMesh();
  }
  if (isIdentityBrushPose(instance, flags)) {
    return null;
  }
  const snapshot = captureBrushSnapshot(solidModel, instance);
  const poseObject = createPoseObject3D(instance);
  const bakeMatrix = buildObjectApplyBakeMatrix(poseObject, flags);
  instance.brush.transformVertices(bakeMatrix);
  compensateBrushFaceUvMatricesForBake(instance, bakeMatrix);
  clearBrushPoseChannels(instance, flags);
  syncBrushPresentation(solidModel, instance);
  return snapshot;
}

/**
 * Restores a brush apply snapshot.
 *
 * @param snapshot Undo snapshot.
 */
export function restoreObjectApplyBrushSnapshot(snapshot: ObjectApplyBrushSnapshot): void {
  const instance = snapshot.solidModel.findBrush(snapshot.brushId);
  if (!instance) {
    return;
  }
  for (let index = 0; index < snapshot.vertices.length; index++) {
    instance.brush.vertices[index]?.copy(snapshot.vertices[index]!);
  }
  instance.brush.recalculatePlanes();
  restoreBrushFaceSurfaces(instance, snapshot.faceSurfaces);
  instance.position.copy(snapshot.pose.position);
  instance.rotation.copy(snapshot.pose.rotation);
  instance.scale.copy(snapshot.pose.scale);
  instance.pushTransformToMesh();
  syncBrushPresentation(snapshot.solidModel, instance);
}

/**
 * Captures brush vertices, pose, and face UV surfaces before baking.
 *
 * @param solidModel Solid model.
 * @param instance Brush instance.
 * @returns Snapshot.
 */
export function captureBrushSnapshot(solidModel: SolidModel, instance: SolidBrushInstance): ObjectApplyBrushSnapshot {
  const poseObject = createPoseObject3D(instance);
  const faceCount = instance.brush.faces.length;
  const faceSurfaces: FaceSurfaceDescription[] = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faceSurfaces.push(instance.getFaceSurface(faceIndex));
  }
  return {
    solidModel,
    brushId: instance.id,
    pose: captureObjectLocalPose(poseObject),
    vertices: instance.brush.vertices.map((vertex) => vertex.clone()),
    faceSurfaces,
  };
}

/**
 * Restores captured per-face surfaces onto a brush instance.
 *
 * @param instance Brush instance.
 * @param faceSurfaces Snapshot surfaces.
 */
function restoreBrushFaceSurfaces(instance: SolidBrushInstance, faceSurfaces: readonly FaceSurfaceDescription[]): void {
  for (let faceIndex = 0; faceIndex < faceSurfaces.length; faceIndex++) {
    instance.setFaceSurface(faceIndex, faceSurfaces[faceIndex]!);
  }
}

/**
 * Rewrites brush-local UV matrices so UVs stay attached after vertices absorb
 * bakeMatrix: M' = M * inv(bake).
 *
 * @param instance Brush instance.
 * @param bakeMatrix Local matrix applied to brush vertices.
 */
export function compensateBrushFaceUvMatricesForBake(instance: SolidBrushInstance, bakeMatrix: THREE.Matrix4): void {
  const inverseBake = bakeMatrix.clone().invert();
  const faceCount = instance.brush.faces.length;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const surface = instance.getFaceSurface(faceIndex);
    const next = cloneFaceSurface(surface);
    next.uv = surface.uv.multiplyMatrix4(inverseBake);
    instance.setFaceSurface(faceIndex, next);
  }
}

/**
 * Builds a temporary Object3D holding the brush local pose.
 *
 * @param instance Brush instance.
 * @returns Pose carrier.
 */
function createPoseObject3D(instance: SolidBrushInstance): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.copy(instance.position);
  object.rotation.copy(instance.rotation);
  object.scale.copy(instance.scale);
  object.updateMatrix();
  return object;
}

/**
 * Clears applied pose channels on the brush instance, then pushes the remaining
 * pose to the preview mesh. Does not re-pull from the mesh (that would restore
 * stale mesh channels that were not part of this bake).
 *
 * @param instance Brush instance.
 * @param flags Applied channels.
 */
function clearBrushPoseChannels(instance: SolidBrushInstance, flags: ObjectApplyTransformFlags): void {
  if (flags.location) {
    instance.position.set(0, 0, 0);
  }
  if (flags.rotation) {
    instance.rotation.set(0, 0, 0);
  }
  if (flags.scale) {
    instance.scale.set(1, 1, 1);
  }
  instance.pushTransformToMesh();
}

/**
 * Rebuilds brush hull and marks the solid model dirty.
 *
 * @param solidModel Solid model.
 * @param instance Brush instance.
 */
export function syncBrushPresentation(solidModel: SolidModel, instance: SolidBrushInstance): void {
  const validation = SolidBrushValidator.validate(instance.brush);
  if (instance.mesh) {
    SolidBrushVisual.replaceHullGeometry(instance.mesh, instance.brush);
    markSolidBrushConvexityState(instance.mesh, validation.valid);
  }
  if (validation.valid) {
    solidModel.markBrushesDirty([instance.id]);
  }
}

/**
 * Returns whether any apply channel is enabled.
 *
 * @param flags Channel flags.
 * @returns True when at least one channel is set.
 */
function hasAnyApplyFlag(flags: ObjectApplyTransformFlags): boolean {
  return flags.location || flags.rotation || flags.scale;
}

/**
 * Returns whether brush pose channels are already identity.
 *
 * @param instance Brush instance.
 * @param flags Channels to inspect.
 * @returns True when bake would be a no-op.
 */
function isIdentityBrushPose(instance: SolidBrushInstance, flags: ObjectApplyTransformFlags): boolean {
  if (flags.location && instance.position.lengthSq() > 1e-12) {
    return false;
  }
  if (
    flags.rotation &&
    (Math.abs(instance.rotation.x) > 1e-6 ||
      Math.abs(instance.rotation.y) > 1e-6 ||
      Math.abs(instance.rotation.z) > 1e-6)
  ) {
    return false;
  }
  if (
    flags.scale &&
    (Math.abs(instance.scale.x - 1) > 1e-6 ||
      Math.abs(instance.scale.y - 1) > 1e-6 ||
      Math.abs(instance.scale.z - 1) > 1e-6)
  ) {
    return false;
  }
  return true;
}
