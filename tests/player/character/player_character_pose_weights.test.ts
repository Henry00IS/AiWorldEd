import { describe, expect, it } from 'vitest';
import {
  playerCharacterApplyPoseWeightsFromState,
  playerCharacterCreatePoseWeights,
} from '@/player/character/player_character_pose_weights.js';
import type { PlayerLocomotionStateId } from '@/player/character/locomotion/state/player_locomotion_state_id.js';

describe('playerCharacterApplyPoseWeightsFromState', () => {
  it('writes exclusive idle torso weights', () => {
    const weights = playerCharacterCreatePoseWeights();
    playerCharacterApplyPoseWeightsFromState(weights, 'idle');
    expect(weights.idle).toBe(1);
    expect(weights.walk + weights.run + weights.air).toBe(0);
    expect(weights.wall).toBe(0);
  });

  it('writes exclusive run torso without wall hands', () => {
    const weights = playerCharacterCreatePoseWeights();
    playerCharacterApplyPoseWeightsFromState(weights, 'run');
    expect(weights.run).toBe(1);
    expect(weights.idle + weights.walk + weights.air).toBe(0);
    expect(weights.wall).toBe(0);
  });

  it('keeps wall idle on upright torso with wall hands', () => {
    const weights = playerCharacterCreatePoseWeights();
    playerCharacterApplyPoseWeightsFromState(weights, 'wall_idle', true);
    expect(weights.idle).toBe(1);
    expect(weights.run).toBe(0);
    expect(weights.walk).toBe(0);
    expect(weights.wall).toBe(1);
  });

  it('allows wall sidestep without hands', () => {
    const weights = playerCharacterCreatePoseWeights();
    playerCharacterApplyPoseWeightsFromState(weights, 'wall_sidestep', false);
    expect(weights.idle).toBe(1);
    expect(weights.wall).toBe(0);
  });

  it('allows wall sidestep with hands', () => {
    const weights = playerCharacterCreatePoseWeights();
    playerCharacterApplyPoseWeightsFromState(weights, 'wall_sidestep', true);
    expect(weights.idle).toBe(1);
    expect(weights.wall).toBe(1);
  });

  it('uses air torso with wall hands while bracing airborne', () => {
    const weights = playerCharacterCreatePoseWeights();
    playerCharacterApplyPoseWeightsFromState(weights, 'jump_wall', true);
    expect(weights.air).toBe(1);
    expect(weights.run).toBe(0);
    expect(weights.wall).toBe(1);
  });

  it('never leaves more than one torso channel hot', () => {
    const states: PlayerLocomotionStateId[] = [
      'idle',
      'walk',
      'run',
      'jump',
      'wall_idle',
      'wall_sidestep',
      'jump_wall',
    ];
    const weights = playerCharacterCreatePoseWeights();
    for (let index = 0; index < states.length; index++) {
      const state = states[index];
      if (!state) {
        continue;
      }
      playerCharacterApplyPoseWeightsFromState(weights, state, true);
      const hot =
        (weights.idle > 0.5 ? 1 : 0) +
        (weights.walk > 0.5 ? 1 : 0) +
        (weights.run > 0.5 ? 1 : 0) +
        (weights.air > 0.5 ? 1 : 0);
      expect(hot).toBe(1);
    }
  });
});
