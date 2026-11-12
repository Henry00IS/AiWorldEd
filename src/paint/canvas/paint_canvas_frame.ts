import * as THREE from 'three';
import { PAINT_TEXELS_PER_UNIT } from '@/paint/paint_constants.js';

/**
 * Orthonormal, right-handed 2D frame on a face plane in brush-local space.
 * Canvas texel coordinates are the projections onto the tangents times the
 * texel density, so the frame only depends on the plane.
 */
export interface PaintCanvasFrame {
  /** Unit plane normal. */
  readonly normal: THREE.Vector3;
  /** Plane offset: points on the plane satisfy dot(normal, point) = offset. */
  readonly offset: number;
  /** First tangent (canvas s axis). */
  readonly tangentS: THREE.Vector3;
  /** Second tangent (canvas t axis); tangentS × tangentT = normal. */
  readonly tangentT: THREE.Vector3;
}

const scratchReference = new THREE.Vector3();

/**
 * Builds the canvas frame of a plane.
 *
 * @param normal Plane normal (any length).
 * @param offset Plane offset along the unit normal.
 * @returns Canvas frame.
 */
export function paintCanvasFrameFromPlane(normal: THREE.Vector3, offset: number): PaintCanvasFrame {
  const unit = normal.clone().normalize();
  if (Math.abs(unit.y) < 0.9) scratchReference.set(0, 1, 0);
  else scratchReference.set(0, 0, 1);
  const tangentS = new THREE.Vector3().crossVectors(scratchReference, unit).normalize();
  const tangentT = new THREE.Vector3().crossVectors(unit, tangentS).normalize();
  return { normal: unit, offset, tangentS, tangentT };
}

/**
 * Projects a brush-local point to canvas texel coordinates.
 *
 * @param frame Canvas frame.
 * @param point Brush-local point.
 * @param target Receives s (x) and t (y) in texels.
 * @returns The target.
 */
export function paintCanvasProject(
  frame: PaintCanvasFrame,
  point: THREE.Vector3,
  target: THREE.Vector2,
): THREE.Vector2 {
  return target.set(
    point.dot(frame.tangentS) * PAINT_TEXELS_PER_UNIT,
    point.dot(frame.tangentT) * PAINT_TEXELS_PER_UNIT,
  );
}

/**
 * Returns the brush-local point on the plane at canvas texel coordinates.
 *
 * @param frame Canvas frame.
 * @param s Canvas s in texels.
 * @param t Canvas t in texels.
 * @param target Receives the point.
 * @returns The target.
 */
export function paintCanvasUnproject(
  frame: PaintCanvasFrame,
  s: number,
  t: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target
    .copy(frame.normal)
    .multiplyScalar(frame.offset)
    .addScaledVector(frame.tangentS, s / PAINT_TEXELS_PER_UNIT)
    .addScaledVector(frame.tangentT, t / PAINT_TEXELS_PER_UNIT);
}
