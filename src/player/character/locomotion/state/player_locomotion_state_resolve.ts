import { PLAYER_RUN_SPEED_METERS_PER_SECOND, PLAYER_WALK_SPEED_METERS_PER_SECOND } from '@/player/player_constants.js';
import { PLAYER_LOCOMOTION_GAIT, playerLocomotionIsBallisticAir } from '../player_locomotion_gait_config.js';
import type { PlayerLocomotionStateId } from './player_locomotion_state_id.js';
import type { PlayerLocomotionStateInput } from './player_locomotion_state_input.js';

/**
 * Resolves exactly one locomotion state.
 *
 * Wall modes and free modes are exclusive. Wall enter and exit both use
 * `isWallPushing` only — the same flag that drives wall-facing — so orientation
 * and animation leave wall modes together.
 *
 * @param input Body drivers.
 * @returns Exclusive state id.
 */
export function playerLocomotionResolveState(input: PlayerLocomotionStateInput): PlayerLocomotionStateId {
  if (playerLocomotionIsBallisticAir(input.isGrounded, input.verticalVelocity, input.planarSpeed)) {
    return input.isWallPushing ? 'jump_wall' : 'jump';
  }
  if (input.isWallPushing) {
    return resolveWallGroundState(input);
  }
  return resolveFreeGroundState(input);
}

/**
 * Picks wall_idle vs wall_sidestep while wall-pushing on the ground.
 *
 * @param input Body drivers with isWallPushing true.
 * @returns Grounded wall state.
 */
function resolveWallGroundState(input: PlayerLocomotionStateInput): PlayerLocomotionStateId {
  if (playerLocomotionHasWallLateralInput(input)) {
    return 'wall_sidestep';
  }
  return 'wall_idle';
}

/**
 * Returns whether lateral desire or motion wants side-step feet.
 *
 * Only consulted while isWallPushing is already true.
 *
 * @param input Body drivers.
 * @returns True when side-step should play.
 */
export function playerLocomotionHasWallLateralInput(input: PlayerLocomotionStateInput): boolean {
  return Math.abs(input.wallLateralIntent) > 1e-4 || Math.abs(input.wallLateralSpeed) > 1e-4;
}

/**
 * Picks idle, walk, or run while free on the ground.
 *
 * @param input Body drivers.
 * @returns Free ground state.
 */
function resolveFreeGroundState(input: PlayerLocomotionStateInput): PlayerLocomotionStateId {
  if (input.planarSpeed < PLAYER_LOCOMOTION_GAIT.settleSpeedMetersPerSecond) {
    return 'idle';
  }
  const runStart = PLAYER_WALK_SPEED_METERS_PER_SECOND * 0.85;
  if (input.wantsRun && input.planarSpeed >= runStart) {
    return 'run';
  }
  if (input.wantsRun && input.planarSpeed >= PLAYER_RUN_SPEED_METERS_PER_SECOND * 0.45) {
    return 'run';
  }
  return 'walk';
}
