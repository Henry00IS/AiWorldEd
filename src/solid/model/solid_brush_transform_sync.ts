import * as THREE from 'three';
import type { SolidBrushInstance } from './solid_brush_instance.js';
import {
  applyLocksToAllBrushFaces,
  captureSolidBrushTextureLockBaseline,
  lockFaceSurfaceForBrushTransform,
  type SolidBrushTextureLockBaseline,
} from '@/texture/lock/solid_brush_texture_lock.js';
import { shouldUpdateMappingsForLocks, type TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';

const scratchLocalMatrix = new THREE.Matrix4();
const scratchWorldMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();

/**
 * Compares Euler rotations component-wise.
 *
 * @param a First rotation.
 * @param b Second rotation.
 * @returns True when equal.
 */
export function eulerEquals(a: THREE.Euler, b: THREE.Euler): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.order === b.order;
}

/**
 * Compares two brush id sequences for equality.
 *
 * @param before Previous ordered ids.
 * @param brushes Current brush list.
 * @returns True when order and membership match.
 */
export function sameBrushOrder(before: string[], brushes: readonly SolidBrushInstance[]): boolean {
  if (before.length !== brushes.length) return false;
  for (let index = 0; index < before.length; index++) {
    if (before[index] !== brushes[index]!.id) return false;
  }
  return true;
}

/**
 * Pulls mesh transform into the brush and applies texture locks to UV matrices.
 *
 * @param brush Brush instance.
 * @param locks Texture lock flags.
 */
export function pullBrushTransformWithOptionalTextureLock(brush: SolidBrushInstance, locks: TextureLockFlags): void {
  if (!brush.mesh) {
    brush.pullTransformFromMesh();
    return;
  }
  const previousWorld = composeBrushWorldMatrix(brush);
  brush.pullTransformFromMesh();
  const nextWorld = composeBrushWorldMatrix(brush);
  if (!shouldUpdateMappingsForLocks(previousWorld, nextWorld, locks)) return;
  applyLocksToAllBrushFaces(brush, previousWorld, nextWorld, locks);
}

/**
 * Live-drag pull with absolute Tex Lock from drag-start baselines. Always
 * re-derives UV matrices from the drag-start surfaces so returning to the start
 * pose (e.g. scale snap back to 1) restores original UVs. Skipping when the
 * delta is identity left intermediate matrices in place and caused UV jumps at
 * the start size under bounds/scale gizmos.
 *
 * @param brush Brush instance.
 * @param locks Texture lock flags.
 * @param baselines Per-brush baselines for the active drag.
 */
export function pullLiveBrushTransform(
  brush: SolidBrushInstance,
  locks: TextureLockFlags,
  baselines?: Map<string, SolidBrushTextureLockBaseline>,
): void {
  if (locks.positionLock && locks.stretchLock) {
    brush.pullTransformFromMesh();
    return;
  }
  if (!baselines) {
    pullBrushTransformWithOptionalTextureLock(brush, locks);
    return;
  }
  if (!baselines.has(brush.id)) {
    baselines.set(brush.id, captureSolidBrushTextureLockBaseline(brush));
  }
  const baseline = baselines.get(brush.id)!;
  const previousWorld =
    baseline.worldMatrix ?? composeWorldFromPose(baseline.position, baseline.rotation, baseline.scale, brush);
  brush.pullTransformFromMesh();
  const nextWorld = composeBrushWorldMatrix(brush);
  const sources = baseline.faceSurfaces ?? baseline.faceMappings ?? [];
  for (let faceIndex = 0; faceIndex < brush.brush.faces.length; faceIndex++) {
    const source = sources[faceIndex] ?? brush.getFaceSurface(faceIndex);
    const locked = lockFaceSurfaceForBrushTransform(source, brush, faceIndex, previousWorld, nextWorld, locks);
    brush.setFaceSurface(faceIndex, locked);
  }
}

/**
 * Captures a drag-start texture lock baseline from the brush mesh as it is now,
 * before the drag changes the brush or any of its CSG group parents.
 *
 * @param brush Brush instance at its pre-drag pose.
 * @returns Baseline holding the pre-drag world matrix.
 */
export function captureDragStartBrushTextureLockBaseline(brush: SolidBrushInstance): SolidBrushTextureLockBaseline {
  brush.pullTransformFromMesh();
  return captureSolidBrushTextureLockBaseline(brush, composeBrushWorldMatrix(brush));
}

/**
 * Copies mesh transform into the brush when it differs from the stored one.
 *
 * @param brush Brush instance to sync.
 * @param locks Texture lock flags.
 * @returns True when any transform or visibility component changed.
 */
export function pullTransformIfChanged(
  brush: SolidBrushInstance,
  locks: TextureLockFlags = { positionLock: false, stretchLock: false },
): boolean {
  if (!brush.mesh) {
    brush.pullTransformFromMesh();
    return false;
  }
  const mesh = brush.mesh;
  const changed =
    !brush.position.equals(mesh.position) ||
    !eulerEquals(brush.rotation, mesh.rotation) ||
    !brush.scale.equals(mesh.scale) ||
    brush.visible !== mesh.visible;
  if (!changed) return false;
  pullBrushTransformWithOptionalTextureLock(brush, locks);
  return true;
}

/**
 * Pulls mesh transforms and returns ids of brushes that actually changed.
 *
 * @param brushes Brush instances to inspect.
 * @param locks Texture lock flags.
 * @returns Brush ids whose transform or visibility changed.
 */
export function pullChangedBrushTransforms(
  brushes: readonly SolidBrushInstance[],
  locks: TextureLockFlags = { positionLock: false, stretchLock: false },
): string[] {
  const changedIds: string[] = [];
  for (const brush of brushes) {
    if (pullTransformIfChanged(brush, locks)) {
      changedIds.push(brush.id);
    }
  }
  return changedIds;
}

/**
 * Pulls transforms from every brush mesh without dirty tracking.
 *
 * @param brushes Brush instances to sync.
 * @param locks Texture lock flags.
 */
export function pullAllBrushTransforms(
  brushes: readonly SolidBrushInstance[],
  locks: TextureLockFlags = { positionLock: false, stretchLock: false },
): void {
  for (const brush of brushes) {
    pullBrushTransformWithOptionalTextureLock(brush, locks);
  }
}

/**
 * Collects brush ids whose preview mesh pose no longer matches instance data.
 *
 * @param brushes Brush instances to inspect.
 * @returns Brush ids that drifted.
 */
export function collectDriftedBrushIds(brushes: readonly SolidBrushInstance[]): string[] {
  const driftedIds: string[] = [];
  for (const brush of brushes) {
    if (!brush.mesh) continue;
    if (brushPoseMatchesMesh(brush)) continue;
    driftedIds.push(brush.id);
  }
  return driftedIds;
}

/**
 * Collects nested brush ids whose intermediate solid-group parent poses no
 * longer match the last prepare-cache fingerprint. Local brush TRS can be
 * unchanged after undo/redo of a group move while model-space CSG is stale.
 *
 * @param brushes Brush instances to inspect.
 * @param getCachedParentChainKey Returns the parent-chain key from the last
 *   prepare cache entry for a brush id.
 * @returns Brush ids that need recompile due to parent-chain drift.
 */
export function collectParentChainDriftedBrushIds(
  brushes: readonly SolidBrushInstance[],
  getCachedParentChainKey: (brushId: string) => string | undefined,
): string[] {
  const driftedIds: string[] = [];
  for (const brush of brushes) {
    if (!brushHasParentChainPoseDrift(brush, getCachedParentChainKey)) {
      continue;
    }
    driftedIds.push(brush.id);
  }
  return driftedIds;
}

/**
 * Returns whether one nested brush has a parent-chain pose that differs from
 * its last prepare-cache fingerprint.
 *
 * @param brush Brush instance to inspect.
 * @param getCachedParentChainKey Cached parent-chain key lookup.
 * @returns True when the brush is nested and the parent chain drifted.
 */
function brushHasParentChainPoseDrift(
  brush: SolidBrushInstance,
  getCachedParentChainKey: (brushId: string) => string | undefined,
): boolean {
  if (!brush.mesh) {
    return false;
  }
  if (!brush.isNestedUnderSolidGroups()) {
    return false;
  }
  const cachedKey = getCachedParentChainKey(brush.id);
  if (cachedKey === undefined) {
    return false;
  }
  return cachedKey !== brush.getParentChainPoseKey();
}

/**
 * Composes brush local-to-world from instance pose and parent.
 *
 * @param brush Brush instance.
 * @returns World matrix.
 */
function composeBrushWorldMatrix(brush: SolidBrushInstance): THREE.Matrix4 {
  return composeWorldFromPose(brush.position, brush.rotation, brush.scale, brush);
}

/**
 * Composes world matrix from pose components and brush parent.
 *
 * @param position Local position.
 * @param rotation Local rotation.
 * @param scale Local scale.
 * @param brush Brush for parent lookup.
 * @returns Independent world matrix.
 */
function composeWorldFromPose(
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
  brush: SolidBrushInstance,
): THREE.Matrix4 {
  scratchQuaternion.setFromEuler(rotation);
  scratchLocalMatrix.compose(position, scratchQuaternion, scale);
  const parent = brush.mesh?.parent;
  if (!parent) return scratchLocalMatrix.clone();
  parent.updateMatrixWorld(true);
  return scratchWorldMatrix.multiplyMatrices(parent.matrixWorld, scratchLocalMatrix).clone();
}

/**
 * Returns whether stored brush transform matches its preview mesh pose.
 *
 * @param brush Brush with optional mesh.
 * @returns True when pose components match.
 */
function brushPoseMatchesMesh(brush: SolidBrushInstance): boolean {
  const mesh = brush.mesh;
  if (!mesh) return true;
  return (
    brush.position.equals(mesh.position) && eulerEquals(brush.rotation, mesh.rotation) && brush.scale.equals(mesh.scale)
  );
}
