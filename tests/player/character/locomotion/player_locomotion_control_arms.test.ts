import { describe, expect, it } from 'vitest';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PlayerLocomotionControlArms } from '@/player/character/locomotion/player_locomotion_control_arms.js';
import type { PlayerLocomotionArmInput } from '@/player/character/locomotion/player_locomotion_control_arms.js';

/**
 * Builds a default arm input bag.
 *
 * @param overrides Partial overrides.
 * @returns Complete arm input.
 */
function createArmInput(overrides: Partial<PlayerLocomotionArmInput> = {}): PlayerLocomotionArmInput {
  return {
    cyclePhaseRadians: 0,
    planarSpeed: 3,
    wantsRun: false,
    isGrounded: true,
    verticalVelocity: 0,
    isSideStep: false,
    deltaSeconds: 1 / 60,
    ...overrides,
  };
}

describe('PlayerLocomotionControlArms', () => {
  it('places run hands high with elbows behind the hands', () => {
    const arms = new PlayerLocomotionControlArms();
    const controls = new PlayerCharacterControlRig();
    for (let step = 0; step < 30; step++) {
      arms.write(
        controls,
        createArmInput({
          cyclePhaseRadians: Math.PI * 0.5,
          planarSpeed: 9,
          wantsRun: true,
        }),
      );
    }
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    const leftElbow = controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleLeft);
    expect(left.y).toBeGreaterThan(1.1);
    expect(right.y).toBeGreaterThan(1.1);
    expect(left.z).toBeLessThan(0);
    expect(right.z).toBeLessThan(0);
    expect(leftElbow.z).toBeLessThan(left.z + 0.02);
    expect(Math.abs(left.x)).toBeGreaterThan(0.3);
  });

  it('trails run hands further back after sustained high speed', () => {
    const arms = new PlayerLocomotionControlArms();
    const controls = new PlayerCharacterControlRig();
    arms.write(controls, createArmInput({ planarSpeed: 9, wantsRun: true, deltaSeconds: 0 }));
    const startZ = controls.get(PLAYER_CHARACTER_CONTROL.handLeft).z;
    for (let step = 0; step < 45; step++) {
      arms.write(controls, createArmInput({ planarSpeed: 9, wantsRun: true }));
    }
    const trailedZ = controls.get(PLAYER_CHARACTER_CONTROL.handLeft).z;
    expect(trailedZ).toBeLessThan(startZ - 0.05);
  });

  it('keeps run elbow poles from leading far ahead of the hands', () => {
    const arms = new PlayerLocomotionControlArms();
    const controls = new PlayerCharacterControlRig();
    for (let step = 0; step < 32; step++) {
      arms.write(
        controls,
        createArmInput({
          cyclePhaseRadians: (step / 32) * Math.PI * 2,
          planarSpeed: 9,
          wantsRun: true,
        }),
      );
      const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
      const leftElbow = controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleLeft);
      expect(leftElbow.z).toBeLessThan(left.z + 0.05);
    }
  });

  it('swings walk hands opposite each other on Z', () => {
    const arms = new PlayerLocomotionControlArms();
    const controls = new PlayerCharacterControlRig();
    let opposite = 0;
    let samples = 0;
    for (let step = 0; step < 32; step++) {
      arms.write(
        controls,
        createArmInput({
          cyclePhaseRadians: (step / 32) * Math.PI * 2,
          planarSpeed: 3,
        }),
      );
      const leftZ = controls.get(PLAYER_CHARACTER_CONTROL.handLeft).z;
      const rightZ = controls.get(PLAYER_CHARACTER_CONTROL.handRight).z;
      if (Math.abs(leftZ) > 0.05 && Math.abs(rightZ) > 0.05) {
        samples += 1;
        if (leftZ * rightZ < 0) {
          opposite += 1;
        }
      }
    }
    expect(samples).toBeGreaterThan(8);
    expect(opposite / samples).toBeGreaterThan(0.85);
  });

  it('keeps walk elbow poles behind the torso across the full cycle', () => {
    const arms = new PlayerLocomotionControlArms();
    const controls = new PlayerCharacterControlRig();
    for (let step = 0; step < 32; step++) {
      arms.write(
        controls,
        createArmInput({
          cyclePhaseRadians: (step / 32) * Math.PI * 2,
          planarSpeed: 3,
        }),
      );
      expect(controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleLeft).z).toBeLessThan(0.05);
      expect(controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleRight).z).toBeLessThan(0.05);
      expect(controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleLeft).x).toBeGreaterThan(0.15);
      expect(controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleRight).x).toBeLessThan(-0.15);
    }
  });

  it('places run hands wider than walk hands', () => {
    const arms = new PlayerLocomotionControlArms();
    const walk = new PlayerCharacterControlRig();
    const run = new PlayerCharacterControlRig();
    arms.write(walk, createArmInput({ planarSpeed: 3 }));
    arms.write(run, createArmInput({ planarSpeed: 9, wantsRun: true }));
    expect(Math.abs(run.get(PLAYER_CHARACTER_CONTROL.handLeft).x)).toBeGreaterThan(
      Math.abs(walk.get(PLAYER_CHARACTER_CONTROL.handLeft).x),
    );
  });

  it('keeps idle hands near the hips while side-stepping', () => {
    const arms = new PlayerLocomotionControlArms();
    const controls = new PlayerCharacterControlRig();
    arms.write(
      controls,
      createArmInput({
        cyclePhaseRadians: 1,
        planarSpeed: 2,
        isSideStep: true,
      }),
    );
    expect(Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.handLeft).z)).toBeLessThan(0.12);
    expect(Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.handRight).z)).toBeLessThan(0.12);
  });

  it('raises hands into the jump pose when airborne', () => {
    const arms = new PlayerLocomotionControlArms();
    const controls = new PlayerCharacterControlRig();
    arms.write(
      controls,
      createArmInput({
        planarSpeed: 0,
        isGrounded: false,
        verticalVelocity: -6,
      }),
    );
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    expect(left.y).toBeGreaterThan(1);
    expect(right.y).toBeGreaterThan(1);
    expect(right.z).toBeGreaterThan(left.z);
  });
});
