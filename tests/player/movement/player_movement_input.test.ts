import { describe, expect, it } from 'vitest';
import {
  playerMovementReadAxes,
  playerMovementResolveSimulationDeltaSeconds,
  playerMovementResolveSpeed,
} from '@/player/movement/player_movement_input.js';
import {
  PLAYER_RUN_SPEED_METERS_PER_SECOND,
  PLAYER_SLOW_MOTION_TIME_SCALE,
  PLAYER_WALK_SPEED_METERS_PER_SECOND,
} from '@/player/player_constants.js';
import type { ManagerInput } from '@/input/manager_input.js';

/**
 * Builds a stub input manager with selected keys held.
 *
 * @param downKeys Codes that report as held.
 * @param shiftDown Whether Shift is held.
 * @returns Stub input manager.
 */
function createInputStub(downKeys: string[], shiftDown: boolean = false): ManagerInput {
  const keySet = new Set(downKeys);
  return {
    isKeyDown: (code: string) => keySet.has(code),
    isShiftDown: () => shiftDown,
  } as unknown as ManagerInput;
}

describe('playerMovementReadAxes', () => {
  it('reads WASD axes and normalizes diagonals', () => {
    const forwardOnly = playerMovementReadAxes(createInputStub(['KeyW']));
    expect(forwardOnly.forward).toBe(1);
    expect(forwardOnly.right).toBe(0);
    const diagonal = playerMovementReadAxes(createInputStub(['KeyW', 'KeyD']));
    expect(diagonal.forward).toBeCloseTo(Math.SQRT1_2);
    expect(diagonal.right).toBeCloseTo(Math.SQRT1_2);
  });

  it('resolves walk and run speeds from Shift', () => {
    expect(playerMovementResolveSpeed(createInputStub([], false))).toBe(PLAYER_WALK_SPEED_METERS_PER_SECOND);
    expect(playerMovementResolveSpeed(createInputStub([], true))).toBe(PLAYER_RUN_SPEED_METERS_PER_SECOND);
  });

  it('scales simulation delta while slow motion is held', () => {
    expect(playerMovementResolveSimulationDeltaSeconds(0.016, false)).toBeCloseTo(0.016);
    expect(playerMovementResolveSimulationDeltaSeconds(0.016, true)).toBeCloseTo(0.016 * PLAYER_SLOW_MOTION_TIME_SCALE);
  });
});
