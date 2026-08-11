import { describe, expect, it } from 'vitest';
import {
  playerLocomotionHasWallLateralInput,
  playerLocomotionResolveState,
} from '@/player/character/locomotion/state/player_locomotion_state_resolve.js';
import type { PlayerLocomotionStateInput } from '@/player/character/locomotion/state/player_locomotion_state_input.js';

/**
 * Builds a state resolve input bag.
 *
 * @param overrides Partial overrides.
 * @returns Complete input.
 */
function createInput(overrides: Partial<PlayerLocomotionStateInput> = {}): PlayerLocomotionStateInput {
  return {
    planarSpeed: 0,
    isGrounded: true,
    isWallPushing: false,
    wantsRun: false,
    verticalVelocity: 0,
    wallLateralSpeed: 0,
    wallLateralIntent: 0,
    ...overrides,
  };
}

describe('playerLocomotionResolveState', () => {
  it('resolves free walk when not wall-pushing even if lateral speed is high', () => {
    expect(
      playerLocomotionResolveState(
        createInput({
          planarSpeed: 4,
          isWallPushing: false,
          wallLateralSpeed: 4,
          wallLateralIntent: 1,
        }),
      ),
    ).toBe('walk');
  });

  it('resolves wall idle when wall-pushing without lateral input', () => {
    expect(
      playerLocomotionResolveState(
        createInput({
          planarSpeed: 0.5,
          isWallPushing: true,
        }),
      ),
    ).toBe('wall_idle');
  });

  it('resolves wall sidestep when wall-pushing with lateral intent', () => {
    expect(
      playerLocomotionResolveState(
        createInput({
          planarSpeed: 2,
          isWallPushing: true,
          wallLateralIntent: 0.8,
          wallLateralSpeed: 1.5,
        }),
      ),
    ).toBe('wall_sidestep');
  });

  it('exits wall modes to walk the moment isWallPushing becomes false', () => {
    expect(
      playerLocomotionResolveState(
        createInput({
          planarSpeed: 3.5,
          isWallPushing: false,
          wallLateralIntent: 0.9,
          wallLateralSpeed: 3.5,
        }),
      ),
    ).toBe('walk');
  });

  it('resolves run when free and sprinting', () => {
    expect(
      playerLocomotionResolveState(
        createInput({
          planarSpeed: 9,
          wantsRun: true,
          isWallPushing: false,
        }),
      ),
    ).toBe('run');
  });

  it('resolves jump wall only while wall-pushing in air', () => {
    expect(
      playerLocomotionResolveState(
        createInput({
          isGrounded: false,
          isWallPushing: true,
          verticalVelocity: 3,
          planarSpeed: 2,
        }),
      ),
    ).toBe('jump_wall');
    expect(
      playerLocomotionResolveState(
        createInput({
          isGrounded: false,
          isWallPushing: false,
          verticalVelocity: 3,
          planarSpeed: 2,
        }),
      ),
    ).toBe('jump');
  });
});

describe('playerLocomotionHasWallLateralInput', () => {
  it('detects lateral intent or speed', () => {
    expect(playerLocomotionHasWallLateralInput(createInput({ wallLateralIntent: 0.2 }))).toBe(true);
    expect(playerLocomotionHasWallLateralInput(createInput({ wallLateralSpeed: 0.3 }))).toBe(true);
    expect(playerLocomotionHasWallLateralInput(createInput())).toBe(false);
  });
});
