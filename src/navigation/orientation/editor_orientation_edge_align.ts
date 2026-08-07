import * as THREE from 'three';
import type { EditorOrientationAxisId } from './editor_orientation_axis.js';
import { EDITOR_DEFAULT_RIGHT, EDITOR_DEFAULT_UP, type EditorPlaneFrame } from './editor_orientation_basis.js';

/** Minimum length for a usable edge direction. */
const EDGE_DIRECTION_MIN_LENGTH_SQ = 1e-20;

/** Reject align when the edge is nearly parallel to the preserved axis. */
const PARALLEL_AXIS_DOT_LIMIT = 0.995;

/** Prefer camera look for sign when |dot| exceeds this. */
const CAMERA_SIGN_DOT_MIN = 0.1;

/** World basis for a rigid working-frame orientation. */
export interface EditorOrientationWorldBasis {
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  zAxis: THREE.Vector3;
}

/** Successful edge-align result with quaternion and grid plane frame. */
export interface EditorOrientationEdgeAlignResult {
  ok: true;
  quaternion: THREE.Quaternion;
  planeFrame: EditorPlaneFrame;
  basis: EditorOrientationWorldBasis;
}

/** Failed edge-align result. */
export interface EditorOrientationEdgeAlignFailure {
  ok: false;
  reason: 'degenerate_edge';
}

/** Union of edge-align outcomes. */
export type EditorOrientationEdgeAlignOutcome = EditorOrientationEdgeAlignResult | EditorOrientationEdgeAlignFailure;

/**
 * Builds a rigid orthonormal working frame by aligning one axis to an edge.
 *
 * @param axis Working-frame axis that should match the edge.
 * @param edgeDirection Unnormalized edge direction in world space.
 * @param currentBasis Current working-frame basis in world space.
 * @param cameraLookDirection Camera look unit vector in world space.
 * @param planeOrigin Origin for the visual grid plane.
 * @returns Aligned basis, or a failure when the edge cannot form a frame.
 */
export function buildEdgeAlignedOrientation(
  axis: EditorOrientationAxisId,
  edgeDirection: THREE.Vector3,
  currentBasis: EditorOrientationWorldBasis,
  cameraLookDirection: THREE.Vector3,
  planeOrigin: THREE.Vector3,
): EditorOrientationEdgeAlignOutcome {
  const unitEdge = normalizeEdgeDirection(edgeDirection);
  if (!unitEdge) {
    return { ok: false, reason: 'degenerate_edge' };
  }
  if (axis === 'x') {
    return alignXAxis(unitEdge, currentBasis, cameraLookDirection, planeOrigin);
  }
  if (axis === 'y') {
    return alignYAxis(unitEdge, currentBasis, cameraLookDirection, planeOrigin);
  }
  return alignZAxis(unitEdge, currentBasis, cameraLookDirection, planeOrigin);
}

/**
 * Builds a plane frame and quaternion from an orthonormal world basis.
 *
 * @param basis Right-handed world basis (X, Y, Z).
 * @param planeOrigin Grid plane origin.
 * @returns Quaternion and plane frame.
 */
export function buildOrientationFromWorldBasis(
  basis: EditorOrientationWorldBasis,
  planeOrigin: THREE.Vector3,
): { quaternion: THREE.Quaternion; planeFrame: EditorPlaneFrame } {
  const quaternion = buildQuaternionFromWorldBasis(basis);
  const planeFrame = buildPlaneFrameFromWorldBasis(basis, planeOrigin);
  return { quaternion, planeFrame };
}

/**
 * Builds the default world basis (identity working frame).
 *
 * @returns Default X/Y/Z axes.
 */
export function buildDefaultWorldBasis(): EditorOrientationWorldBasis {
  return {
    xAxis: EDITOR_DEFAULT_RIGHT.clone(),
    yAxis: EDITOR_DEFAULT_UP.clone(),
    zAxis: new THREE.Vector3(0, 0, 1),
  };
}

/**
 * Derives a world basis from an orientation quaternion.
 *
 * @param quaternion Local-editor-to-world quaternion.
 * @returns World X/Y/Z axes of the working frame.
 */
export function worldBasisFromQuaternion(quaternion: THREE.Quaternion): EditorOrientationWorldBasis {
  const xAxis = EDITOR_DEFAULT_RIGHT.clone().applyQuaternion(quaternion).normalize();
  const yAxis = EDITOR_DEFAULT_UP.clone().applyQuaternion(quaternion).normalize();
  const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  return { xAxis, yAxis, zAxis };
}

/**
 * Aligns working X to the edge, preserves Y, recomputes Z.
 *
 * @param unitEdge Signed unit edge direction candidate.
 * @param currentBasis Current frame.
 * @param cameraLookDirection Camera look for sign.
 * @param planeOrigin Plane origin.
 * @returns Align outcome.
 */
function alignXAxis(
  unitEdge: THREE.Vector3,
  currentBasis: EditorOrientationWorldBasis,
  cameraLookDirection: THREE.Vector3,
  planeOrigin: THREE.Vector3,
): EditorOrientationEdgeAlignOutcome {
  const newX = chooseSignedAxis(unitEdge, cameraLookDirection, currentBasis.xAxis);
  const newY = resolvePreserveAxis(newX, currentBasis.yAxis, [
    currentBasis.zAxis,
    EDITOR_DEFAULT_UP,
    EDITOR_DEFAULT_RIGHT,
  ]);
  const newZ = new THREE.Vector3().crossVectors(newX, newY).normalize();
  newY.crossVectors(newZ, newX).normalize();
  return finishAlignBasis({ xAxis: newX, yAxis: newY, zAxis: newZ }, planeOrigin);
}

/**
 * Aligns working Y to the edge, preserves Z, recomputes X.
 *
 * @param unitEdge Signed unit edge direction candidate.
 * @param currentBasis Current frame.
 * @param cameraLookDirection Camera look for sign.
 * @param planeOrigin Plane origin.
 * @returns Align outcome.
 */
function alignYAxis(
  unitEdge: THREE.Vector3,
  currentBasis: EditorOrientationWorldBasis,
  cameraLookDirection: THREE.Vector3,
  planeOrigin: THREE.Vector3,
): EditorOrientationEdgeAlignOutcome {
  const newY = chooseSignedAxis(unitEdge, cameraLookDirection, currentBasis.yAxis);
  const newZ = resolvePreserveAxis(newY, currentBasis.zAxis, [
    currentBasis.xAxis,
    new THREE.Vector3(0, 0, 1),
    EDITOR_DEFAULT_RIGHT,
  ]);
  const newX = new THREE.Vector3().crossVectors(newY, newZ).normalize();
  newZ.crossVectors(newX, newY).normalize();
  return finishAlignBasis({ xAxis: newX, yAxis: newY, zAxis: newZ }, planeOrigin);
}

/**
 * Aligns working Z to the edge, preserves Y, recomputes X.
 *
 * @param unitEdge Signed unit edge direction candidate.
 * @param currentBasis Current frame.
 * @param cameraLookDirection Camera look for sign.
 * @param planeOrigin Plane origin.
 * @returns Align outcome.
 */
function alignZAxis(
  unitEdge: THREE.Vector3,
  currentBasis: EditorOrientationWorldBasis,
  cameraLookDirection: THREE.Vector3,
  planeOrigin: THREE.Vector3,
): EditorOrientationEdgeAlignOutcome {
  const newZ = chooseSignedAxis(unitEdge, cameraLookDirection, currentBasis.zAxis);
  const newY = resolvePreserveAxis(newZ, currentBasis.yAxis, [
    currentBasis.xAxis,
    EDITOR_DEFAULT_UP,
    EDITOR_DEFAULT_RIGHT,
  ]);
  const newX = new THREE.Vector3().crossVectors(newY, newZ).normalize();
  newY.crossVectors(newZ, newX).normalize();
  return finishAlignBasis({ xAxis: newX, yAxis: newY, zAxis: newZ }, planeOrigin);
}

/**
 * Packages a finished orthonormal basis into an align result.
 *
 * @param basis Right-handed basis.
 * @param planeOrigin Plane origin.
 * @returns Success result.
 */
function finishAlignBasis(
  basis: EditorOrientationWorldBasis,
  planeOrigin: THREE.Vector3,
): EditorOrientationEdgeAlignResult {
  const built = buildOrientationFromWorldBasis(basis, planeOrigin);
  return {
    ok: true,
    quaternion: built.quaternion,
    planeFrame: built.planeFrame,
    basis,
  };
}

/**
 * Chooses ±edge using camera look, with continuity fallback.
 *
 * @param unitEdge Unit edge direction.
 * @param cameraLookDirection Camera look direction.
 * @param currentAxis Current working axis for continuity.
 * @returns Signed unit axis direction.
 */
function chooseSignedAxis(
  unitEdge: THREE.Vector3,
  cameraLookDirection: THREE.Vector3,
  currentAxis: THREE.Vector3,
): THREE.Vector3 {
  const cameraDot = unitEdge.dot(cameraLookDirection);
  if (Math.abs(cameraDot) >= CAMERA_SIGN_DOT_MIN) {
    return cameraDot >= 0 ? unitEdge.clone() : unitEdge.clone().negate();
  }
  const continuityDot = unitEdge.dot(currentAxis);
  return continuityDot >= 0 ? unitEdge.clone() : unitEdge.clone().negate();
}

/**
 * Projects the preferred preserve-axis when possible, otherwise tries
 * alternates and finally a stable perpendicular so any non-degenerate edge can
 * form a frame (vertical edges with Align Z no longer fail).
 *
 * @param lockedAxis Axis already assigned from the edge.
 * @param preferred Axis to keep as much as possible.
 * @param alternates Fallback directions when preferred is parallel to locked.
 * @returns Unit projected preserve axis.
 */
function resolvePreserveAxis(
  lockedAxis: THREE.Vector3,
  preferred: THREE.Vector3,
  alternates: readonly THREE.Vector3[],
): THREE.Vector3 {
  const preferredProjected = projectPreserveAxis(preferred, lockedAxis);
  if (preferredProjected) {
    return preferredProjected;
  }
  for (const candidate of alternates) {
    const projected = projectPreserveAxis(candidate, lockedAxis);
    if (projected) {
      return projected;
    }
  }
  return buildStablePerpendicularToAxis(lockedAxis);
}

/**
 * Projects a preserve-axis onto the plane perpendicular to the locked axis.
 *
 * @param preserveAxis Axis to keep as much as possible.
 * @param lockedAxis Axis already assigned from the edge.
 * @returns Unit projected axis, or null when nearly parallel.
 */
function projectPreserveAxis(preserveAxis: THREE.Vector3, lockedAxis: THREE.Vector3): THREE.Vector3 | null {
  if (Math.abs(preserveAxis.dot(lockedAxis)) > PARALLEL_AXIS_DOT_LIMIT) {
    return null;
  }
  const projected = preserveAxis.clone().addScaledVector(lockedAxis, -preserveAxis.dot(lockedAxis));
  if (projected.lengthSq() < EDGE_DIRECTION_MIN_LENGTH_SQ) {
    return null;
  }
  return projected.normalize();
}

/**
 * Builds any unit direction perpendicular to the locked axis.
 *
 * @param lockedAxis Unit locked axis.
 * @returns Unit perpendicular axis.
 */
function buildStablePerpendicularToAxis(lockedAxis: THREE.Vector3): THREE.Vector3 {
  const seed =
    Math.abs(lockedAxis.dot(EDITOR_DEFAULT_UP)) <= PARALLEL_AXIS_DOT_LIMIT ? EDITOR_DEFAULT_UP : EDITOR_DEFAULT_RIGHT;
  const fromSeed = projectPreserveAxis(seed, lockedAxis);
  if (fromSeed) {
    return fromSeed;
  }
  const fallback = Math.abs(lockedAxis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3().crossVectors(lockedAxis, fallback).normalize();
}

/**
 * Normalizes an edge direction when it has usable length.
 *
 * @param edgeDirection Raw edge direction.
 * @returns Unit edge, or null when degenerate.
 */
function normalizeEdgeDirection(edgeDirection: THREE.Vector3): THREE.Vector3 | null {
  if (edgeDirection.lengthSq() < EDGE_DIRECTION_MIN_LENGTH_SQ) {
    return null;
  }
  return edgeDirection.clone().normalize();
}

/**
 * Builds a local-to-world quaternion from world X/Y/Z columns.
 *
 * @param basis Right-handed world basis.
 * @returns Orientation quaternion.
 */
function buildQuaternionFromWorldBasis(basis: EditorOrientationWorldBasis): THREE.Quaternion {
  const matrix = new THREE.Matrix4().makeBasis(basis.xAxis, basis.yAxis, basis.zAxis);
  return new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
}

/**
 * Builds a visual grid plane frame from a world basis.
 *
 * @param basis Right-handed world basis.
 * @param planeOrigin Plane origin.
 * @returns Plane frame (U=X, V=Z, normal=Y).
 */
function buildPlaneFrameFromWorldBasis(
  basis: EditorOrientationWorldBasis,
  planeOrigin: THREE.Vector3,
): EditorPlaneFrame {
  return {
    origin: planeOrigin.clone(),
    uAxis: basis.xAxis.clone().normalize(),
    vAxis: basis.zAxis.clone().normalize(),
    normal: basis.yAxis.clone().normalize(),
  };
}
