import * as THREE from 'three';
import {
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_COLLISION_SURFACE_OFFSET_METERS,
  PLAYER_GROUND_PROBE_BACKSTEP_METERS,
  PLAYER_GROUND_PROBE_EXTRA_METERS,
  PLAYER_GROUND_PROBE_MAX_ITERATIONS,
  PLAYER_GROUND_PROBE_MIN_METERS,
  PLAYER_STEP_HEIGHT_METERS,
} from '@/player/player_constants.js';
import { playerCapsuleCast } from './player_capsule_cast.js';
import { playerCollisionNormalIsStableSupport } from './player_collision_stability.js';
import { playerCollisionSupportReportClear, type PlayerCollisionFrameState } from './player_collision_frame_state.js';
import type { PlayerTriangleSoup } from './player_triangle_soup.js';

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Returns whether ground snap is suppressed this frame.
 *
 * @param frameState Frame state with suppression flags.
 * @returns True when ground probing is forced off.
 */
export function playerCollisionIsGroundSnapSuppressed(frameState: PlayerCollisionFrameState): boolean {
  return frameState.suppressGroundSnap || frameState.groundSnapSuppressionSeconds > 0;
}

/**
 * Suppresses ground snap for a short window after a jump or forced leave.
 *
 * @param frameState Frame state.
 * @param timeSeconds Duration to suppress floor snap.
 */
export function playerCollisionSuppressGroundSnap(
  frameState: PlayerCollisionFrameState,
  timeSeconds: number = 0.1,
): void {
  frameState.suppressGroundSnap = true;
  frameState.groundSnapSuppressionSeconds = timeSeconds;
}

/**
 * Counts down the ground-snap suppression timer.
 *
 * @param frameState Frame state.
 * @param deltaSeconds Frame delta.
 */
export function playerCollisionTickGroundSnapSuppression(
  frameState: PlayerCollisionFrameState,
  deltaSeconds: number,
): void {
  if (frameState.groundSnapSuppressionSeconds > 0) {
    frameState.groundSnapSuppressionSeconds = Math.max(0, frameState.groundSnapSuppressionSeconds - deltaSeconds);
  }
  frameState.suppressGroundSnap = false;
}

/**
 * Chooses the ground probe distance from last-frame support state.
 *
 * @param frameState Frame state with previousSupportReport.
 * @returns Probe distance in meters.
 */
export function playerCollisionResolveGroundProbeDistance(frameState: PlayerCollisionFrameState): number {
  if (playerCollisionIsGroundSnapSuppressed(frameState)) {
    return PLAYER_GROUND_PROBE_MIN_METERS;
  }
  if (frameState.previousSupportReport.isWalkableSupport || frameState.supportContactedWhileMoving) {
    return Math.max(PLAYER_COLLIDER_RADIUS_METERS, PLAYER_STEP_HEIGHT_METERS) + PLAYER_GROUND_PROBE_EXTRA_METERS;
  }
  return Math.max(PLAYER_GROUND_PROBE_MIN_METERS, PLAYER_GROUND_PROBE_EXTRA_METERS);
}

/**
 * Probes for ground and snaps the feet when stable support is found.
 *
 * Only snaps downward along the probe. Higher surfaces are climbed through step
 * handling during movement, not by ground snap.
 *
 * @param soup Triangle soup.
 * @param feetPosition Feet pose mutated when snapping.
 * @param probeDistance Maximum downward probe distance.
 * @param frameState Frame state.
 */
export function playerCollisionProbeAndSnapGroundSupport(
  soup: PlayerTriangleSoup,
  feetPosition: THREE.Vector3,
  probeDistance: number,
  frameState: PlayerCollisionFrameState,
): void {
  playerCollisionSupportReportClear(frameState.supportReport);
  if (playerCollisionIsGroundSnapSuppressed(frameState)) {
    feetPosition.y += PLAYER_GROUND_PROBE_MIN_METERS * 1.5;
    return;
  }
  let remaining = Math.max(probeDistance, PLAYER_GROUND_PROBE_MIN_METERS);
  const probeOrigin = frameState.sampleFeet;
  probeOrigin.copy(feetPosition);
  let sweeps = 0;
  while (remaining > 0 && sweeps <= PLAYER_GROUND_PROBE_MAX_ITERATIONS) {
    const found = playerCollisionGroundSweepDown(soup, probeOrigin, remaining, frameState);
    if (!found) {
      break;
    }
    frameState.supportReport.hasSupportContact = true;
    frameState.supportReport.groundNormal.copy(frameState.groundHit.normal);
    frameState.supportReport.groundPoint.copy(frameState.groundHit.point);
    if (playerCollisionNormalIsStableSupport(frameState.groundHit.normal)) {
      frameState.supportReport.isWalkableSupport = true;
      const snapDistance = Math.max(0, frameState.groundHit.distance - PLAYER_COLLISION_SURFACE_OFFSET_METERS);
      feetPosition.copy(probeOrigin).addScaledVector(WORLD_DOWN, snapDistance);
      return;
    }
    const advance = Math.max(PLAYER_COLLISION_SURFACE_OFFSET_METERS, frameState.groundHit.distance);
    probeOrigin.addScaledVector(WORLD_DOWN, advance);
    probeOrigin.addScaledVector(WORLD_UP, PLAYER_COLLISION_SURFACE_OFFSET_METERS);
    remaining = Math.max(0, remaining - advance);
    sweeps += 1;
  }
}

/**
 * Capsule-casts downward for ground with a raised origin backstep.
 *
 * Casts from a raised origin then reports distance relative to feetOrigin so
 * snapping does not inherit the backstep lift.
 *
 * @param soup Triangle soup.
 * @param feetOrigin Feet pose that owns the reported hit distance.
 * @param distance Cast distance below feetOrigin.
 * @param frameState Frame state.
 * @returns True when a hit is found.
 */
function playerCollisionGroundSweepDown(
  soup: PlayerTriangleSoup,
  feetOrigin: THREE.Vector3,
  distance: number,
  frameState: PlayerCollisionFrameState,
): boolean {
  frameState.cast.castOrigin.copy(feetOrigin).addScaledVector(WORLD_UP, PLAYER_GROUND_PROBE_BACKSTEP_METERS);
  const found = playerCapsuleCast(
    soup,
    frameState.cast.castOrigin,
    WORLD_DOWN,
    distance + PLAYER_GROUND_PROBE_BACKSTEP_METERS,
    frameState.cast,
    frameState.groundHit,
  );
  if (!found) {
    return false;
  }
  frameState.groundHit.distance = Math.max(0, frameState.groundHit.distance - PLAYER_GROUND_PROBE_BACKSTEP_METERS);
  return true;
}
