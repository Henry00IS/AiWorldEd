/**
 * Exclusive locomotion pose states. Exactly one is active.
 *
 * Free ground: idle | walk | run Air: jump | jump_wall Wall-push (only while
 * isWallPushing): wall_idle | wall_sidestep.
 */
export type PlayerLocomotionStateId = 'idle' | 'walk' | 'run' | 'jump' | 'wall_idle' | 'wall_sidestep' | 'jump_wall';

/**
 * Returns whether the state plants palms on a wall.
 *
 * @param state Active locomotion state.
 * @param handsAvailable True when solid exists at hand height with push intent.
 * @returns True when hands should target wall palms.
 */
export function playerLocomotionStateUsesWallHands(
  state: PlayerLocomotionStateId,
  handsAvailable: boolean = true,
): boolean {
  if (!handsAvailable) {
    return false;
  }
  return state === 'wall_idle' || state === 'wall_sidestep' || state === 'jump_wall';
}

/**
 * Returns whether the state uses wall-aligned grounded feet.
 *
 * @param state Active locomotion state.
 * @returns True for grounded wall poses.
 */
export function playerLocomotionStateUsesWallFeet(state: PlayerLocomotionStateId): boolean {
  return state === 'wall_idle' || state === 'wall_sidestep';
}

/**
 * Returns whether the state uses jump/fall feet.
 *
 * @param state Active locomotion state.
 * @returns True for airborne poses.
 */
export function playerLocomotionStateUsesJumpFeet(state: PlayerLocomotionStateId): boolean {
  return state === 'jump' || state === 'jump_wall';
}

/**
 * Returns torso clip mode for the exclusive state.
 *
 * @param state Active locomotion state.
 * @returns Single torso sample mode.
 */
export function playerLocomotionStateTorsoMode(state: PlayerLocomotionStateId): 'idle' | 'walk' | 'run' | 'air' {
  if (state === 'walk') {
    return 'walk';
  }
  if (state === 'run') {
    return 'run';
  }
  if (state === 'jump' || state === 'jump_wall') {
    return 'air';
  }
  return 'idle';
}
