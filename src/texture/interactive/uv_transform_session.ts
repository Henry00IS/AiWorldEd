import * as THREE from 'three';
import type { UvTransformMode } from './uv_transform_mode.js';
import type { UvTransformRegionTarget } from './uv_transform_target_builder.js';
import type { UvTransformSnapOptions } from './math/uv_transform_snap_math.js';
import { applyUvMoveToMatrix, computeWorldDeltaBetweenPoints } from './math/uv_transform_move_math.js';
import { applyUvRotateToMatrix, measureSignedRotationDegrees } from './math/uv_transform_rotate_math.js';
import {
  applyUvScaleToMatrix,
  computeUniformScaleFactor,
  measureInPlaneRadius,
} from './math/uv_transform_scale_math.js';
import { snapUvMoveWorldDelta, snapUvRotationDegrees, snapUvScaleFactor } from './math/uv_transform_snap_math.js';
import { FaceTextureMapping, cloneFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Live UV transform session state. */
export interface UvTransformSession {
  /** Active transform mode. */
  mode: UvTransformMode;
  /** Regions being edited. */
  targets: UvTransformRegionTarget[];
  /** World drag plane. */
  dragPlane: THREE.Plane;
  /** World pivot / start intersection. */
  worldStart: THREE.Vector3;
  /** Unit plane normal for the start face. */
  planeNormal: THREE.Vector3;
  /**
   * Minimum in-plane distance from the pivot before rotate/scale lock a
   * reference radius. Zero for move.
   */
  minRadialStartDistance: number;
  /** True once rotate/scale have locked their reference radius. */
  hasRadialReference: boolean;
  /** Start radius for scale mode (locked after dead zone). */
  startRadius: number;
  /** Start direction from pivot for rotate mode. */
  startDirection: THREE.Vector3;
  /** Snap options (session-local). */
  snap: UvTransformSnapOptions;
}

/** Result of applying one live sample to all targets. */
export interface UvTransformSampleResult {
  /** Per-target updated mappings. */
  mappings: FaceTextureMapping[];
}

/**
 * Creates a UV transform session from start geometry and targets.
 *
 * @param mode Transform mode.
 * @param targets Region baselines.
 * @param worldStart Start plane intersection.
 * @param planeNormal Start face normal.
 * @param snap Snap options.
 * @param minRadialStartDistance Dead-zone radius for rotate/scale (0 for move).
 * @returns New session.
 */
export function createUvTransformSession(
  mode: UvTransformMode,
  targets: UvTransformRegionTarget[],
  worldStart: THREE.Vector3,
  planeNormal: THREE.Vector3,
  snap: UvTransformSnapOptions,
  minRadialStartDistance: number = 0,
): UvTransformSession {
  const normal = planeNormal.clone().normalize();
  return {
    mode,
    targets,
    dragPlane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, worldStart),
    worldStart: worldStart.clone(),
    planeNormal: normal,
    minRadialStartDistance: Math.max(0, minRadialStartDistance),
    hasRadialReference: false,
    startRadius: 0,
    startDirection: new THREE.Vector3(),
    snap: { ...snap },
  };
}

/**
 * Seeds rotate/scale start vectors from the first sample past the radial dead
 * zone.
 *
 * @param session Session to update.
 * @param worldSample Current plane intersection.
 * @returns True when the radial reference is locked after this call.
 */
export function seedUvTransformRadialStart(session: UvTransformSession, worldSample: THREE.Vector3): boolean {
  if (session.hasRadialReference) {
    return true;
  }
  const radius = measureInPlaneRadius(worldSample, session.worldStart, session.planeNormal);
  if (radius < session.minRadialStartDistance || radius < 1e-6) {
    return false;
  }
  const direction = worldSample.clone().sub(session.worldStart);
  direction.addScaledVector(session.planeNormal, -direction.dot(session.planeNormal));
  if (direction.lengthSq() < 1e-12) {
    return false;
  }
  session.startDirection.copy(direction.normalize());
  session.startRadius = radius;
  session.hasRadialReference = true;
  return true;
}

/**
 * Applies one pointer sample and returns updated mappings for every target.
 *
 * @param session Active session.
 * @param worldSample Current plane intersection.
 * @returns Per-target mappings.
 */
export function sampleUvTransformSession(
  session: UvTransformSession,
  worldSample: THREE.Vector3,
): UvTransformSampleResult {
  if (session.mode === 'move') {
    return sampleMove(session, worldSample);
  }
  if (session.mode === 'rotate') {
    return sampleRotate(session, worldSample);
  }
  return sampleScale(session, worldSample);
}

/**
 * Samples a move session.
 *
 * @param session Active session.
 * @param worldSample Current intersection.
 * @returns Updated mappings.
 */
function sampleMove(session: UvTransformSession, worldSample: THREE.Vector3): UvTransformSampleResult {
  const rawDelta = computeWorldDeltaBetweenPoints(session.worldStart, worldSample);
  const delta = snapUvMoveWorldDelta(rawDelta, session.planeNormal, session.snap);
  return mapTargets(session, (baseline) => applyUvMoveToMatrix(baseline.uv, delta));
}

/**
 * Samples a rotate session. No change until the cursor leaves the dead zone.
 *
 * @param session Active session.
 * @param worldSample Current intersection.
 * @returns Updated mappings.
 */
function sampleRotate(session: UvTransformSession, worldSample: THREE.Vector3): UvTransformSampleResult {
  if (!seedUvTransformRadialStart(session, worldSample)) {
    return mapTargets(session, (baseline) => baseline.uv.clone());
  }
  const currentDirection = worldSample.clone().sub(session.worldStart);
  const rawDegrees = measureSignedRotationDegrees(session.startDirection, currentDirection, session.planeNormal);
  const degrees = snapUvRotationDegrees(rawDegrees, session.snap);
  return mapTargets(session, (baseline) =>
    applyUvRotateToMatrix(baseline.uv, session.worldStart, session.planeNormal, degrees),
  );
}

/**
 * Samples a scale session. No change until the cursor leaves the dead zone;
 * then scale is currentRadius / startRadius with a floor so returning toward
 * the pivot does not explode to infinity.
 *
 * @param session Active session.
 * @param worldSample Current intersection.
 * @returns Updated mappings.
 */
function sampleScale(session: UvTransformSession, worldSample: THREE.Vector3): UvTransformSampleResult {
  if (!seedUvTransformRadialStart(session, worldSample)) {
    return mapTargets(session, (baseline) => baseline.uv.clone());
  }
  const currentRadius = measureInPlaneRadius(worldSample, session.worldStart, session.planeNormal);
  const safeCurrentRadius = Math.max(currentRadius, session.startRadius * 0.05);
  const rawFactor = computeUniformScaleFactor(session.startRadius, safeCurrentRadius);
  const factor = snapUvScaleFactor(rawFactor, session.snap);
  return mapTargets(session, (baseline) => applyUvScaleToMatrix(baseline.uv, session.worldStart, factor));
}

/**
 * Maps each target baseline through a UV matrix transform.
 *
 * @param session Session with baselines.
 * @param transform Matrix transform from baseline mapping.
 * @returns Cloned mappings with transformed UV.
 */
function mapTargets(
  session: UvTransformSession,
  transform: (baseline: FaceTextureMapping) => SurfaceUvMatrix,
): UvTransformSampleResult {
  const mappings = session.targets.map((target) => {
    const next = cloneFaceTextureMapping(target.baselineMapping);
    next.uv = transform(target.baselineMapping);
    return next;
  });
  return { mappings };
}
