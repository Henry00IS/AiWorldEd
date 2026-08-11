import * as THREE from 'three';
import {
  createPlayerCapsuleCastHit,
  createPlayerCapsuleCastScratch,
  type PlayerCapsuleCastHit,
  type PlayerCapsuleCastScratch,
} from './player_capsule_cast.js';

/** Floor-support sample for one simulation frame. */
export interface PlayerCollisionSupportReport {
  hasSupportContact: boolean;
  isWalkableSupport: boolean;
  groundNormal: THREE.Vector3;
  groundPoint: THREE.Vector3;
}

/** Classification of one sweep impact (walkable vs step-climbable wall). */
export interface PlayerCollisionImpactReport {
  isStable: boolean;
  stepClimbAvailable: boolean;
}

/** Mutable working state reused across player collision frames. */
export interface PlayerCollisionFrameState {
  cast: PlayerCapsuleCastScratch;
  castHit: PlayerCapsuleCastHit;
  stepHit: PlayerCapsuleCastHit;
  groundHit: PlayerCapsuleCastHit;
  supportReport: PlayerCollisionSupportReport;
  previousSupportReport: PlayerCollisionSupportReport;
  impactReport: PlayerCollisionImpactReport;
  travelVelocity: THREE.Vector3;
  remainingDirection: THREE.Vector3;
  remainingVelocity: THREE.Vector3;
  moveIntent: THREE.Vector3;
  wallNormal: THREE.Vector3;
  stepForward: THREE.Vector3;
  sampleFeet: THREE.Vector3;
  supportContactedWhileMoving: boolean;
  suppressGroundSnap: boolean;
  groundSnapSuppressionSeconds: number;
  didStepUpThisFrame: boolean;
  isWallPushing: boolean;
}

/**
 * Creates a fresh collision frame state bag.
 *
 * @returns Frame state.
 */
export function createPlayerCollisionFrameState(): PlayerCollisionFrameState {
  return {
    cast: createPlayerCapsuleCastScratch(),
    castHit: createPlayerCapsuleCastHit(),
    stepHit: createPlayerCapsuleCastHit(),
    groundHit: createPlayerCapsuleCastHit(),
    supportReport: createPlayerCollisionSupportReport(),
    previousSupportReport: createPlayerCollisionSupportReport(),
    impactReport: createPlayerCollisionImpactReport(),
    travelVelocity: new THREE.Vector3(),
    remainingDirection: new THREE.Vector3(),
    remainingVelocity: new THREE.Vector3(),
    moveIntent: new THREE.Vector3(),
    wallNormal: new THREE.Vector3(),
    stepForward: new THREE.Vector3(),
    sampleFeet: new THREE.Vector3(),
    supportContactedWhileMoving: false,
    suppressGroundSnap: false,
    groundSnapSuppressionSeconds: 0,
    didStepUpThisFrame: false,
    isWallPushing: false,
  };
}

/**
 * Creates an empty floor-support report.
 *
 * @returns Support report.
 */
export function createPlayerCollisionSupportReport(): PlayerCollisionSupportReport {
  return {
    hasSupportContact: false,
    isWalkableSupport: false,
    groundNormal: new THREE.Vector3(0, 1, 0),
    groundPoint: new THREE.Vector3(),
  };
}

/**
 * Creates an empty impact classification report.
 *
 * @returns Impact report.
 */
export function createPlayerCollisionImpactReport(): PlayerCollisionImpactReport {
  return {
    isStable: false,
    stepClimbAvailable: false,
  };
}

/**
 * Copies one support report into another.
 *
 * @param source Source report.
 * @param target Destination report.
 */
export function playerCollisionSupportReportCopy(
  source: PlayerCollisionSupportReport,
  target: PlayerCollisionSupportReport,
): void {
  target.hasSupportContact = source.hasSupportContact;
  target.isWalkableSupport = source.isWalkableSupport;
  target.groundNormal.copy(source.groundNormal);
  target.groundPoint.copy(source.groundPoint);
}

/**
 * Resets a support report to the empty airborne state.
 *
 * @param status Report mutated in place.
 */
export function playerCollisionSupportReportClear(status: PlayerCollisionSupportReport): void {
  status.hasSupportContact = false;
  status.isWalkableSupport = false;
  status.groundNormal.set(0, 1, 0);
  status.groundPoint.set(0, 0, 0);
}
