import type { PlayerLocomotionStateId } from '@/player/character/locomotion/state/player_locomotion_state_id.js';
import { playerLocomotionStateTorsoMode } from '@/player/character/locomotion/state/player_locomotion_state_id.js';

/**
 * One-hot torso weights derived from the exclusive locomotion state. Only one
 * base channel is 1; wall is a hand/orient flag and never mixes run lean.
 */
export interface PlayerCharacterPoseWeights {
  idle: number;
  walk: number;
  run: number;
  air: number;
  /** 1 while wall hands are active; does not blend torso clips. */
  wall: number;
}

/**
 * Creates pose weights that start fully idle with no wall hands.
 *
 * @returns Initial weight bag.
 */
export function playerCharacterCreatePoseWeights(): PlayerCharacterPoseWeights {
  return { idle: 1, walk: 0, run: 0, air: 0, wall: 0 };
}

/**
 * Writes exclusive one-hot pose weights from the active locomotion state.
 *
 * @param weights Weight bag mutated in place.
 * @param state Exclusive locomotion state.
 * @param wallHandsActive True when palms plant on the wall.
 */
export function playerCharacterApplyPoseWeightsFromState(
  weights: PlayerCharacterPoseWeights,
  state: PlayerLocomotionStateId,
  wallHandsActive: boolean = false,
): void {
  weights.idle = 0;
  weights.walk = 0;
  weights.run = 0;
  weights.air = 0;
  weights.wall = 0;
  const torso = playerLocomotionStateTorsoMode(state);
  if (torso === 'walk') {
    weights.walk = 1;
  } else if (torso === 'run') {
    weights.run = 1;
  } else if (torso === 'air') {
    weights.air = 1;
  } else {
    weights.idle = 1;
  }
  if (wallHandsActive) {
    weights.wall = 1;
  }
}
