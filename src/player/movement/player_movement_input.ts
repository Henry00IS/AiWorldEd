import type { ManagerInput } from '@/input/manager_input.js';
import {
  PLAYER_RUN_SPEED_METERS_PER_SECOND,
  PLAYER_SLOW_MOTION_TIME_SCALE,
  PLAYER_WALK_SPEED_METERS_PER_SECOND,
} from '@/player/player_constants.js';

/** Horizontal move axes from WASD, scaled to unit length when diagonal. */
export interface PlayerMoveAxes {
  forward: number;
  right: number;
}

/**
 * Reads WASD axes from physical key positions.
 *
 * @param inputManager Shared input manager.
 * @returns Normalized forward/right axes in [-1, 1].
 */
export function playerMovementReadAxes(inputManager: ManagerInput): PlayerMoveAxes {
  let forward = 0;
  let right = 0;
  if (inputManager.isPhysicalKeyDown('KeyW')) {
    forward += 1;
  }
  if (inputManager.isPhysicalKeyDown('KeyS')) {
    forward -= 1;
  }
  if (inputManager.isPhysicalKeyDown('KeyD')) {
    right += 1;
  }
  if (inputManager.isPhysicalKeyDown('KeyA')) {
    right -= 1;
  }
  return normalizeMoveAxes(forward, right);
}

/**
 * Resolves walk or run speed from the Shift key state.
 *
 * @param inputManager Shared input manager.
 * @returns Target horizontal speed in meters per second.
 */
export function playerMovementResolveSpeed(inputManager: ManagerInput): number {
  if (inputManager.isShiftDown()) {
    return PLAYER_RUN_SPEED_METERS_PER_SECOND;
  }
  return PLAYER_WALK_SPEED_METERS_PER_SECOND;
}

/**
 * Returns whether jump was requested this frame via Space.
 *
 * @param inputManager Shared input manager.
 * @returns True while Space is held (edge handled by caller).
 */
export function playerMovementIsJumpHeld(inputManager: ManagerInput): boolean {
  return inputManager.isKeyDown('Space');
}

/**
 * Scales play-mode simulation delta for Control-held slow motion.
 *
 * @param rawDeltaSeconds Unscaled frame delta.
 * @param isSlowMotionHeld True while Control is held.
 * @returns Scaled simulation delta used by body and avatar.
 */
export function playerMovementResolveSimulationDeltaSeconds(
  rawDeltaSeconds: number,
  isSlowMotionHeld: boolean,
): number {
  if (!isSlowMotionHeld) {
    return rawDeltaSeconds;
  }
  return rawDeltaSeconds * PLAYER_SLOW_MOTION_TIME_SCALE;
}

/**
 * Normalizes diagonal axes so diagonal movement is not faster.
 *
 * @param forward Forward axis before normalize.
 * @param right Right axis before normalize.
 * @returns Unit-length axes when non-zero.
 */
function normalizeMoveAxes(forward: number, right: number): PlayerMoveAxes {
  const lengthSquared = forward * forward + right * right;
  if (lengthSquared <= 1 || lengthSquared < 1e-12) {
    return { forward, right };
  }
  const inverseLength = 1 / Math.sqrt(lengthSquared);
  return {
    forward: forward * inverseLength,
    right: right * inverseLength,
  };
}
