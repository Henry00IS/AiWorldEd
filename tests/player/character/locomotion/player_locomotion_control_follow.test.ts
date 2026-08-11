import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import {
  PlayerLocomotionControlFollow,
  type PlayerLocomotionControlFollowOptions,
} from '@/player/character/locomotion/player_locomotion_control_follow.js';
import { PLAYER_LOCOMOTION_GAIT } from '@/player/character/locomotion/player_locomotion_gait_config.js';

/**
 * Builds default follow options.
 *
 * @param root Character root.
 * @param overrides Partial overrides.
 * @returns Complete options.
 */
function createFollowOptions(
  root: THREE.Object3D,
  overrides: Partial<PlayerLocomotionControlFollowOptions> = {},
): PlayerLocomotionControlFollowOptions {
  return {
    characterRoot: root,
    planarSpeed: 0,
    verticalSpeed: 0,
    deltaSeconds: 1 / 60,
    snapFeetToDesired: false,
    worldLockFeet: false,
    ...overrides,
  };
}

/**
 * Seeds a control rig with neutral limb targets.
 *
 * @param controls Control rig.
 */
function seedNeutralControls(controls: PlayerCharacterControlRig): void {
  controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.08, 0.09, 0);
  controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.08, 0.09, 0);
  controls.set(PLAYER_CHARACTER_CONTROL.kneePoleLeft, 0.1, 0.4, 0.1);
  controls.set(PLAYER_CHARACTER_CONTROL.kneePoleRight, -0.1, 0.4, 0.1);
  controls.set(PLAYER_CHARACTER_CONTROL.handLeft, 0.2, 0.8, 0);
  controls.set(PLAYER_CHARACTER_CONTROL.handRight, -0.2, 0.8, 0);
  controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleLeft, 0.3, 0.7, -0.1);
  controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleRight, -0.3, 0.7, -0.1);
}

describe('PlayerLocomotionControlFollow', () => {
  it('rate-limits a hard desired retarget over one frame', () => {
    const follow = new PlayerLocomotionControlFollow();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    seedNeutralControls(controls);
    follow.apply(controls, createFollowOptions(root));
    const before = controls.get(PLAYER_CHARACTER_CONTROL.footLeft).clone();
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.5, 0.09, 0);
    follow.apply(controls, createFollowOptions(root));
    const after = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const maxStep =
      PLAYER_LOCOMOTION_GAIT.controlFollowMaxSpeedMetersPerSecond / 60 +
      PLAYER_LOCOMOTION_GAIT.controlFollowBodySpeedSlackMetersPerSecond / 60 +
      1e-3;
    expect(after.distanceTo(before)).toBeLessThanOrEqual(maxStep);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.x).toBeLessThan(0.5);
  });

  it('does not freeze feet when delta time is zero', () => {
    const follow = new PlayerLocomotionControlFollow();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    seedNeutralControls(controls);
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.5, 0.09, 0.4);
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.5, 0.09, -0.3);
    follow.apply(controls, createFollowOptions(root));
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.08, 0.09, 0.2);
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.08, 0.09, -0.2);
    follow.apply(controls, createFollowOptions(root, { planarSpeed: 3, deltaSeconds: 0 }));
    expect(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z).toBeCloseTo(0.2, 5);
    expect(controls.get(PLAYER_CHARACTER_CONTROL.footRight).z).toBeCloseTo(-0.2, 5);
  });

  it('snaps live feet to desired when requested without teleporting hands', () => {
    const follow = new PlayerLocomotionControlFollow();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    seedNeutralControls(controls);
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.5, 0.09, 0.4);
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.5, 0.09, -0.3);
    follow.apply(controls, createFollowOptions(root));
    const handBefore = controls.get(PLAYER_CHARACTER_CONTROL.handLeft).clone();
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.08, 0.09, 0);
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.08, 0.09, 0);
    controls.set(PLAYER_CHARACTER_CONTROL.handLeft, 0.45, 1.2, 0.5);
    controls.set(PLAYER_CHARACTER_CONTROL.handRight, -0.45, 1.2, 0.5);
    follow.apply(controls, createFollowOptions(root, { planarSpeed: 5, snapFeetToDesired: true }));
    expect(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).x).toBeCloseTo(0.08, 5);
    expect(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z).toBeCloseTo(0, 5);
    expect(controls.get(PLAYER_CHARACTER_CONTROL.footRight).x).toBeCloseTo(-0.08, 5);
    expect(controls.get(PLAYER_CHARACTER_CONTROL.footRight).z).toBeCloseTo(0, 5);
    const handAfter = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const maxHandStep =
      Math.max(
        PLAYER_LOCOMOTION_GAIT.controlFollowMaxSpeedMetersPerSecond,
        5 * PLAYER_LOCOMOTION_GAIT.controlFollowBodySpeedScale +
          PLAYER_LOCOMOTION_GAIT.controlFollowBodySpeedSlackMetersPerSecond,
      ) /
        60 +
      1e-3;
    expect(handAfter.distanceTo(handBefore)).toBeLessThanOrEqual(maxHandStep);
    expect(handAfter.distanceTo(new THREE.Vector3(0.45, 1.2, 0.5))).toBeGreaterThan(0.2);
    expect(handAfter.x).toBeLessThan(0.45);
  });

  it('keeps a world plant fixed when the root translates while world-locked', () => {
    const follow = new PlayerLocomotionControlFollow();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    seedNeutralControls(controls);
    follow.apply(controls, createFollowOptions(root, { worldLockFeet: true }));
    const plantWorld = controls
      .get(PLAYER_CHARACTER_CONTROL.footRight)
      .clone()
      .applyQuaternion(root.quaternion)
      .add(root.position);
    root.position.x += 0.12;
    root.updateMatrixWorld(true);
    const desiredLocal = plantWorld.clone().sub(root.position);
    desiredLocal.applyQuaternion(root.quaternion.clone().invert());
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, desiredLocal.x, desiredLocal.y, desiredLocal.z);
    follow.apply(controls, createFollowOptions(root, { planarSpeed: 4, worldLockFeet: true }));
    const afterLocal = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    const afterWorld = afterLocal.clone().applyQuaternion(root.quaternion).add(root.position);
    expect(afterWorld.distanceTo(plantWorld)).toBeLessThan(0.02);
  });

  it('keeps free feet with the body while falling instead of lagging in world space', () => {
    const follow = new PlayerLocomotionControlFollow();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.position.set(0, 10, 0);
    root.updateMatrixWorld(true);
    seedNeutralControls(controls);
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.08, 0.12, 0);
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.08, 0.27, 0.39);
    follow.apply(controls, createFollowOptions(root, { snapFeetToDesired: true }));
    for (let step = 0; step < 30; step++) {
      root.position.y -= 0.25;
      root.updateMatrixWorld(true);
      controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.08, 0.12, 0);
      controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.08, 0.27, 0.39);
      follow.apply(
        controls,
        createFollowOptions(root, {
          planarSpeed: 0,
          verticalSpeed: 15,
          snapFeetToDesired: true,
          worldLockFeet: false,
        }),
      );
    }
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(left.y).toBeCloseTo(0.12, 2);
    expect(right.y).toBeCloseTo(0.27, 2);
    expect(right.z).toBeCloseTo(0.39, 2);
    expect(left.y).toBeLessThan(0.5);
  });
});
