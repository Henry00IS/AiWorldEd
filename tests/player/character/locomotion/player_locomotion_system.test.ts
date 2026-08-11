import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PLAYER_LOCOMOTION_GAIT } from '@/player/character/locomotion/player_locomotion_gait_config.js';
import { PlayerLocomotionSystem } from '@/player/character/locomotion/player_locomotion_system.js';
import { PlayerBodyState } from '@/player/movement/player_body_state.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';

/**
 * Builds a grounded body with planar motion and optional wall push.
 *
 * @param options Motion and wall options.
 * @returns Configured body state.
 */
function createBody(options: {
  speedZ?: number;
  speedX?: number;
  intentX?: number;
  intentZ?: number;
  wallNormal?: THREE.Vector3;
  wallHands?: boolean;
  wantsRun?: boolean;
}): PlayerBodyState {
  const body = new PlayerBodyState();
  const world = new PlayerCollisionWorld();
  body.resetAt(new THREE.Vector3(0, 0, 0), world, false, 0);
  forceGroundedMotion(body, options);
  return body;
}

/**
 * Writes grounded velocity and wall state through private fields for tests.
 *
 * @param body Body to mutate.
 * @param options Motion options.
 */
function forceGroundedMotion(
  body: PlayerBodyState,
  options: {
    speedZ?: number;
    speedX?: number;
    intentX?: number;
    intentZ?: number;
    wallNormal?: THREE.Vector3;
    /** Tall-wall hand plants; defaults true when a wall normal is provided. */
    wallHands?: boolean;
    wantsRun?: boolean;
  },
): void {
  const anyBody = body as unknown as {
    isGrounded: boolean;
    planarSpeed: number;
    horizontalVelocity: THREE.Vector3;
    moveIntent: THREE.Vector3;
    isWallPushing: boolean;
    wallNormal: THREE.Vector3;
    wantsRun: boolean;
  };
  anyBody.isGrounded = true;
  anyBody.horizontalVelocity.set(options.speedX ?? 0, 0, options.speedZ ?? 0);
  anyBody.planarSpeed = anyBody.horizontalVelocity.length();
  anyBody.moveIntent.set(options.intentX ?? 0, 0, options.intentZ ?? 1);
  anyBody.wantsRun = options.wantsRun ?? false;
  if (options.wallNormal) {
    anyBody.isWallPushing = options.wallHands ?? true;
    anyBody.wallNormal.copy(options.wallNormal);
  } else {
    anyBody.isWallPushing = false;
    anyBody.wallNormal.set(0, 0, 0);
  }
}

describe('PlayerLocomotionSystem', () => {
  it('writes opposite foot Z offsets while walking free', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({ speedZ: 3.5, intentZ: 1 });
    let opposite = 0;
    let samples = 0;
    for (let step = 0; step < 90; step++) {
      system.update(controls, root, body, 1 / 60);
      const leftZ = controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z;
      const rightZ = controls.get(PLAYER_CHARACTER_CONTROL.footRight).z;
      if (Math.abs(leftZ) > 0.05 && Math.abs(rightZ) > 0.05) {
        samples += 1;
        if (leftZ * rightZ < 0) {
          opposite += 1;
        }
      }
    }
    expect(samples).toBeGreaterThan(10);
    expect(opposite / samples).toBeGreaterThan(0.85);
    expect(system.getIsSideStep()).toBe(false);
    expect(system.getState()).toBe('walk');
  });

  it('enters side-step mode when wall pushing with lateral intent', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedX: 1.5,
      intentX: 1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    for (let step = 0; step < 30; step++) {
      system.update(controls, root, body, 1 / 60);
    }
    expect(system.getIsSideStep()).toBe(true);
    expect(system.getState()).toBe('wall_sidestep');
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.z)).toBeLessThan(0.1);
    expect(Math.abs(right.z)).toBeLessThan(0.1);
  });

  it('interpolates feet under the body after entering wall side-step from a walk', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const freeBody = createBody({ speedZ: 5, intentZ: 1 });
    for (let step = 0; step < 40; step++) {
      system.update(controls, root, freeBody, 1 / 60);
    }
    const walkLeftZ = Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z);
    expect(walkLeftZ).toBeGreaterThan(0.05);
    const wallBody = createBody({
      speedX: 5,
      intentX: 1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    system.update(controls, root, wallBody, 1 / 60);
    expect(system.getIsSideStep()).toBe(true);
    const leftAfterOne = controls.get(PLAYER_CHARACTER_CONTROL.footLeft).clone();
    expect(Math.abs(leftAfterOne.z)).toBeLessThan(walkLeftZ + 0.02);
    for (let step = 0; step < 45; step++) {
      system.update(controls, root, wallBody, 1 / 60);
    }
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.z)).toBeLessThan(0.08);
    expect(Math.abs(right.z)).toBeLessThan(0.08);
    expect(Math.abs(left.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.12);
    expect(Math.abs(right.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.12);
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(0);
  });

  it('does not teleport feet in one frame when side-step direction reverses', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedX: 1.5,
      intentX: 1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    for (let step = 0; step < 40; step++) {
      root.position.x += 0.02;
      root.updateMatrixWorld(true);
      system.update(controls, root, body, 1 / 60);
    }
    const leftBefore = controls.get(PLAYER_CHARACTER_CONTROL.footLeft).clone();
    const rightBefore = controls.get(PLAYER_CHARACTER_CONTROL.footRight).clone();
    forceGroundedMotion(body, {
      speedX: -1.5,
      intentX: -1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    system.update(controls, root, body, 1 / 60);
    const leftAfter = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const rightAfter = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(leftBefore.distanceTo(leftAfter)).toBeLessThan(0.35);
    expect(rightBefore.distanceTo(rightAfter)).toBeLessThan(0.35);
  });

  it('exits wall side-step to free walk the moment wall-push ends', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedX: 1.5,
      intentX: 1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    for (let step = 0; step < 10; step++) {
      system.update(controls, root, body, 1 / 60);
    }
    expect(system.getIsSideStep()).toBe(true);
    forceGroundedMotion(body, {
      speedX: 1.5,
      intentX: 1,
      intentZ: 0,
    });
    system.update(controls, root, body, 1 / 60);
    expect(system.getState()).toBe('walk');
    expect(system.getIsSideStep()).toBe(false);
  });

  it('returns to free idle feet after leaving wall without residual run lean state', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedX: 1.5,
      intentX: 1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
      wantsRun: true,
    });
    for (let step = 0; step < 40; step++) {
      root.position.x += 0.025;
      root.updateMatrixWorld(true);
      system.update(controls, root, body, 1 / 60);
    }
    expect(system.getState()).toBe('wall_sidestep');
    forceGroundedMotion(body, {
      speedX: 0,
      intentX: 0,
      intentZ: 0,
    });
    for (let step = 0; step < 45; step++) {
      system.update(controls, root, body, 1 / 60);
    }
    expect(system.getState()).toBe('idle');
    const leftSettled = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    expect(Math.abs(leftSettled.z)).toBeLessThan(0.08);
    expect(system.getIsSideStep()).toBe(false);
  });

  it('raises hands toward the wall in exclusive wall idle', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedZ: 0,
      intentZ: 1,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    system.update(controls, root, body, 1 / 60);
    expect(system.getState()).toBe('wall_idle');
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    expect(left.z).toBeGreaterThan(0.2);
    expect(right.z).toBeGreaterThan(0.2);
    expect(left.y).toBeGreaterThan(1);
    expect(right.y).toBeGreaterThan(1);
  });

  it('keeps jump feet while placing hands on a wall while airborne', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedZ: 2,
      intentZ: 1,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    const anyBody = body as unknown as { isGrounded: boolean; verticalVelocity: number };
    anyBody.isGrounded = false;
    anyBody.verticalVelocity = 6;
    system.update(controls, root, body, 1 / 60);
    expect(system.getState()).toBe('jump_wall');
    expect(system.getIsSideStep()).toBe(false);
    const leftFoot = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const rightFoot = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(rightFoot.z).toBeGreaterThan(0.2);
    expect(rightFoot.y).toBeGreaterThan(leftFoot.y);
    const leftHand = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const rightHand = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    expect(leftHand.z).toBeGreaterThan(0.2);
    expect(rightHand.z).toBeGreaterThan(0.2);
  });

  it('does not stay in run state while wall pushing at run speed', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedZ: 10,
      intentZ: 1,
      wallNormal: new THREE.Vector3(0, 0, -1),
      wantsRun: true,
    });
    for (let step = 0; step < 20; step++) {
      system.update(controls, root, body, 1 / 60);
    }
    expect(system.getState()).not.toBe('run');
    expect(system.getState() === 'wall_idle' || system.getState() === 'wall_sidestep').toBe(true);
  });

  it('uses free walk when not wall-pushing even while scraping a wall', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedX: 1.5,
      intentX: 1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
      wallHands: false,
    });
    for (let step = 0; step < 20; step++) {
      system.update(controls, root, body, 1 / 60);
    }
    expect(system.getState()).toBe('walk');
    expect(system.getUsesWallHands()).toBe(false);
    expect(system.getIsSideStep()).toBe(false);
  });

  it('reseeds feet under the body when the wall normal turns a corner', () => {
    const system = new PlayerLocomotionSystem();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const body = createBody({
      speedX: 1.5,
      intentX: 1,
      intentZ: 0,
      wallNormal: new THREE.Vector3(0, 0, -1),
    });
    for (let step = 0; step < 20; step++) {
      root.position.x += 0.02;
      root.updateMatrixWorld(true);
      system.update(controls, root, body, 1 / 60);
    }
    forceGroundedMotion(body, {
      speedZ: 1.5,
      intentZ: 1,
      intentX: 0,
      wallNormal: new THREE.Vector3(-1, 0, 0),
    });
    system.update(controls, root, body, 1 / 60);
    expect(system.getState()).toBe('wall_sidestep');
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.x)).toBeLessThan(0.2);
    expect(Math.abs(right.x)).toBeLessThan(0.2);
    expect(Math.abs(left.z)).toBeLessThan(0.2);
    expect(Math.abs(right.z)).toBeLessThan(0.2);
  });
});
