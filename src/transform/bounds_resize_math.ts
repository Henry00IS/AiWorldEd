import * as THREE from 'three';
import { BoundsFace } from '../types/bounds_face.js';
import {
  getBoundsFaceHalfExtent,
  getBoundsFaceLocalNormal,
  OrientedBoundsData
} from './oriented_bounds.js';

/** Minimum half-extent allowed when resizing a bounds face. */
export const MIN_BOUNDS_HALF_EXTENT = 0.05;

/**
 * Result of applying a one-sided bounds resize to a single mesh.
 */
export interface MeshBoundsResizeResult {
  position: THREE.Vector3;
  scale: THREE.Vector3;
}

/**
 * Computes the world-space center of the opposite (fixed) face before a resize.
 * @param bounds The oriented bounds at drag start.
 * @param face The face being dragged.
 * @returns World position of the fixed opposite face center.
 */
export function getFixedFaceWorldCenter(
  bounds: OrientedBoundsData,
  face: BoundsFace
): THREE.Vector3 {
  const outward = getBoundsFaceLocalNormal(face)
    .applyQuaternion(bounds.quaternion)
    .normalize();
  const half = getBoundsFaceHalfExtent(bounds.halfExtents, face);
  return bounds.center.clone().addScaledVector(outward, -half);
}

/**
 * Snaps a signed face displacement so the face lands on the world grid.
 * Uses the absolute face coordinate (start + delta), not the delta alone,
 * so an off-grid brush can re-enter the grid on the first resize step.
 * @param deltaAlongNormal Raw displacement along the face outward normal.
 * @param snapEnabled Whether grid snapping is active.
 * @param snapInterval Grid interval when snapping.
 * @param startFaceCoordinate Face center projected onto the outward normal at drag start.
 * @returns Snapped or raw delta relative to the start face.
 */
export function snapBoundsFaceDelta(
  deltaAlongNormal: number,
  snapEnabled: boolean,
  snapInterval: number,
  startFaceCoordinate: number = 0
): number {
  if (!snapEnabled || snapInterval <= 0) return deltaAlongNormal;
  const targetCoordinate = startFaceCoordinate + deltaAlongNormal;
  const snappedCoordinate =
    Math.round(targetCoordinate / snapInterval) * snapInterval;
  return snappedCoordinate - startFaceCoordinate;
}

/**
 * Computes absolute position and scale after a one-sided resize of one mesh.
 * The opposite face stays fixed in world space.
 * @param startPosition Mesh position at drag start.
 * @param startScale Mesh scale at drag start.
 * @param startBounds OBB at drag start (object or selection frame).
 * @param face The face being dragged outward.
 * @param deltaAlongNormal Signed world displacement of the dragged face.
 * @returns New position and scale for the mesh.
 */
export function computeOneSidedMeshResize(
  startPosition: THREE.Vector3,
  startScale: THREE.Vector3,
  startBounds: OrientedBoundsData,
  face: BoundsFace,
  deltaAlongNormal: number
): MeshBoundsResizeResult {
  const oldHalf = getBoundsFaceHalfExtent(startBounds.halfExtents, face);
  const safeOldHalf = Math.max(oldHalf, MIN_BOUNDS_HALF_EXTENT);
  const newHalf = Math.max(MIN_BOUNDS_HALF_EXTENT, safeOldHalf + deltaAlongNormal * 0.5);
  const factor = newHalf / safeOldHalf;
  const outward = getBoundsFaceLocalNormal(face)
    .applyQuaternion(startBounds.quaternion)
    .normalize();
  const appliedDelta = (newHalf - safeOldHalf) * 2;
  const position = startPosition.clone().addScaledVector(outward, appliedDelta * 0.5);
  const scale = multiplyScaleAlongLocalFace(startScale, face, factor);
  return { position, scale };
}

/**
 * Multiplies a scale vector along the local axis of a bounds face.
 * @param startScale Scale at drag start.
 * @param face The face defining the local axis.
 * @param factor Multiplicative scale factor along that axis.
 * @returns A new scale vector.
 */
export function multiplyScaleAlongLocalFace(
  startScale: THREE.Vector3,
  face: BoundsFace,
  factor: number
): THREE.Vector3 {
  const scale = startScale.clone();
  const safeFactor = Math.max(0.01, factor);
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
    scale.x = Math.max(0.01, scale.x * safeFactor);
    return scale;
  }
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
    scale.y = Math.max(0.01, scale.y * safeFactor);
    return scale;
  }
  scale.z = Math.max(0.01, scale.z * safeFactor);
  return scale;
}

/**
 * Multiplies scale along the dominant world axis of a direction.
 * Used for multi-select world-AABB resize.
 * @param startScale Scale at drag start.
 * @param worldAxis Direction of resize in world space.
 * @param factor Multiplicative factor.
 * @returns A new scale vector.
 */
export function multiplyScaleAlongWorldAxis(
  startScale: THREE.Vector3,
  worldAxis: THREE.Vector3,
  factor: number
): THREE.Vector3 {
  const scale = startScale.clone();
  const safeFactor = Math.max(0.01, factor);
  const absX = Math.abs(worldAxis.x);
  const absY = Math.abs(worldAxis.y);
  const absZ = Math.abs(worldAxis.z);
  if (absX >= absY && absX >= absZ) {
    scale.x = Math.max(0.01, scale.x * safeFactor);
    return scale;
  }
  if (absY >= absX && absY >= absZ) {
    scale.y = Math.max(0.01, scale.y * safeFactor);
    return scale;
  }
  scale.z = Math.max(0.01, scale.z * safeFactor);
  return scale;
}

/**
 * Computes multi-mesh one-sided resize using a shared world-axis bounds frame.
 * @param startPosition Mesh position at drag start.
 * @param startScale Mesh scale at drag start.
 * @param startBounds Shared selection bounds at drag start.
 * @param face The face being dragged.
 * @param deltaAlongNormal Signed displacement of the dragged face.
 * @returns New position and scale.
 */
export function computeOneSidedMultiMeshResize(
  startPosition: THREE.Vector3,
  startScale: THREE.Vector3,
  startBounds: OrientedBoundsData,
  face: BoundsFace,
  deltaAlongNormal: number
): MeshBoundsResizeResult {
  const oldHalf = getBoundsFaceHalfExtent(startBounds.halfExtents, face);
  const safeOldHalf = Math.max(oldHalf, MIN_BOUNDS_HALF_EXTENT);
  const newHalf = Math.max(MIN_BOUNDS_HALF_EXTENT, safeOldHalf + deltaAlongNormal * 0.5);
  const factor = newHalf / safeOldHalf;
  const outward = getBoundsFaceLocalNormal(face)
    .applyQuaternion(startBounds.quaternion)
    .normalize();
  const appliedDelta = (newHalf - safeOldHalf) * 2;
  const position = startPosition.clone().addScaledVector(outward, appliedDelta * 0.5);
  const scale = multiplyScaleAlongWorldAxis(startScale, outward, factor);
  return { position, scale };
}
