import * as THREE from 'three';
import { SurfaceUvMatrix } from './surface_uv_matrix.js';

/** Position and stretch lock flags for solid brush UV matrices. */
export interface SurfaceUvLockFlags {
  /** When true, UVs stick through translation and rotation. */
  positionLock: boolean;
  /** When true, UVs stretch with scale. */
  stretchLock: boolean;
}

const scratchPrevPos = new THREE.Vector3();
const scratchNextPos = new THREE.Vector3();
const scratchPrevScale = new THREE.Vector3();
const scratchNextScale = new THREE.Vector3();
const scratchPrevQuat = new THREE.Quaternion();
const scratchNextQuat = new THREE.Quaternion();
const scratchInvPrev = new THREE.Matrix4();
const scratchDelta = new THREE.Matrix4();

/**
 * Transforms a brush-local UV matrix across a brush local-to-world pose change
 * according to position/stretch locks.
 *
 * Full stick (both locks): matrix unchanged — geometry carries UV. World-fixed
 * (unlocked components): M' = M * inv(L_prev) * L_next so world UV stays fixed.
 * Stretch lock off uses this on scale so pulling a side reveals more tiles
 * locked to the stationary side (bounds pivot).
 *
 * @param uv UV matrix before the pose change (brush-local).
 * @param faceNormalLocal Face normal in brush-local space.
 * @param facePlaneOffsetLocal Plane offset d in brush-local space.
 * @param previousLocalToWorld Brush local→world before transform.
 * @param nextLocalToWorld Brush local→world after transform.
 * @param flags Lock flags.
 * @returns UV matrix for the new pose (brush-local).
 */
export function transformBrushLocalUvForPoseChange(
  uv: SurfaceUvMatrix,
  faceNormalLocal: THREE.Vector3,
  facePlaneOffsetLocal: number,
  previousLocalToWorld: THREE.Matrix4,
  nextLocalToWorld: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): SurfaceUvMatrix {
  void faceNormalLocal;
  void facePlaneOffsetLocal;
  previousLocalToWorld.decompose(scratchPrevPos, scratchPrevQuat, scratchPrevScale);
  nextLocalToWorld.decompose(scratchNextPos, scratchNextQuat, scratchNextScale);
  const moved = poseTranslationOrRotationChanged();
  const scaled = !scratchPrevScale.equals(scratchNextScale);
  if (!shouldApplyWorldFixedUv(flags, moved, scaled)) {
    return uv.clone();
  }
  return applyWorldFixedUvMatrix(uv, previousLocalToWorld, nextLocalToWorld);
}

/**
 * Returns whether world-fixed UV rewrite (or content rebake) applies for a pose
 * delta. Scale is governed only by stretch lock so face-pivot scale+translate
 * still stretches when Stretch Lock is on without Pos Lock.
 *
 * @param flags Lock flags.
 * @param moved True when translation or rotation changed.
 * @param scaled True when scale changed.
 * @returns True when the UV matrix should be world-fixed.
 */
export function shouldApplyWorldFixedUv(flags: SurfaceUvLockFlags, moved: boolean, scaled: boolean): boolean {
  if (scaled) {
    return !flags.stretchLock;
  }
  if (moved) {
    return !flags.positionLock;
  }
  return false;
}

/**
 * Rewrites a brush-local UV matrix so world-space UVs stay fixed under a pose
 * change: M_local' = M_local * inv(L_prev) * L_next.
 *
 * @param uv Previous brush-local UV matrix.
 * @param previousLocalToWorld Prior pose.
 * @param nextLocalToWorld New pose.
 * @returns Updated brush-local UV matrix.
 */
function applyWorldFixedUvMatrix(
  uv: SurfaceUvMatrix,
  previousLocalToWorld: THREE.Matrix4,
  nextLocalToWorld: THREE.Matrix4,
): SurfaceUvMatrix {
  scratchInvPrev.copy(previousLocalToWorld).invert();
  scratchDelta.multiplyMatrices(scratchInvPrev, nextLocalToWorld);
  return uv.multiplyMatrix4(scratchDelta);
}

/**
 * Returns whether translation or rotation changed between decompositions.
 *
 * @returns True when moved or rotated.
 */
function poseTranslationOrRotationChanged(): boolean {
  if (!scratchPrevPos.equals(scratchNextPos)) return true;
  return (
    Math.abs(scratchPrevQuat.x - scratchNextQuat.x) > 1e-10 ||
    Math.abs(scratchPrevQuat.y - scratchNextQuat.y) > 1e-10 ||
    Math.abs(scratchPrevQuat.z - scratchNextQuat.z) > 1e-10 ||
    Math.abs(scratchPrevQuat.w - scratchNextQuat.w) > 1e-10
  );
}
