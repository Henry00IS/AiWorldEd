import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import {
  PlayerLocomotionGaitCycle,
  type PlayerLocomotionGaitInput,
} from '@/player/character/locomotion/player_locomotion_gait_cycle.js';
import { PLAYER_LOCOMOTION_GAIT } from '@/player/character/locomotion/player_locomotion_gait_config.js';

/**
 * Builds a gait input bag.
 *
 * @param overrides Partial overrides.
 * @returns Complete gait input.
 */
function createInput(overrides: Partial<PlayerLocomotionGaitInput> = {}): PlayerLocomotionGaitInput {
  return {
    planarSpeed: 3.5,
    verticalVelocity: 0,
    wantsRun: false,
    isGrounded: true,
    isWallIdle: false,
    isSideStep: false,
    sideStepSign: 1,
    sideStepLateralSpeed: 0,
    deltaSeconds: 1 / 60,
    characterRoot: null,
    wallNormalWorld: null,
    ...overrides,
  };
}

/**
 * Converts a character-local control point to world using a root pose.
 *
 * @param root Character root.
 * @param local Local point.
 * @returns World point.
 */
function localControlToWorld(root: THREE.Object3D, local: THREE.Vector3): THREE.Vector3 {
  const world = local.clone().applyQuaternion(root.quaternion);
  world.add(root.position);
  return world;
}

/**
 * Resolves step length the gait uses for a given planar speed.
 *
 * @param planarSpeed Planar speed meters per second.
 * @returns Step length meters.
 */
function resolveStepLength(lateralSpeed: number): number {
  const speed = Math.max(Math.abs(lateralSpeed), PLAYER_LOCOMOTION_GAIT.settleSpeedMetersPerSecond);
  const raw =
    PLAYER_LOCOMOTION_GAIT.sideStepComfortLengthMeters + speed * PLAYER_LOCOMOTION_GAIT.sideStepLengthSpeedScale;
  return THREE.MathUtils.clamp(
    raw,
    PLAYER_LOCOMOTION_GAIT.sideStepMinLengthMeters,
    PLAYER_LOCOMOTION_GAIT.sideStepMaxLengthMeters,
  );
}

/**
 * Enters wall side-step under a fixed root without advancing travel.
 *
 * @param cycle Gait cycle.
 * @param controls Control rig.
 * @param root Character root.
 * @param planarSpeed Planar speed.
 * @param sign Travel sign.
 */
function enterSideStep(
  cycle: PlayerLocomotionGaitCycle,
  controls: PlayerCharacterControlRig,
  root: THREE.Object3D,
  planarSpeed: number,
  sign = 1,
): void {
  cycle.update(controls, createInput({ planarSpeed: 0, isSideStep: false, characterRoot: root }));
  cycle.update(
    controls,
    createInput({
      isSideStep: true,
      isWallIdle: false,
      sideStepSign: sign,
      sideStepLateralSpeed: planarSpeed * sign,
      planarSpeed,
      characterRoot: root,
      deltaSeconds: 0,
    }),
  );
}

/**
 * Advances an active side-step by moving the root along character left.
 *
 * @param cycle Gait cycle.
 * @param controls Control rig.
 * @param root Character root.
 * @param planarSpeed Planar speed.
 * @param travelMeters Signed distance along character left (+ left).
 * @param sign Commanded travel sign.
 */
function travelSideStep(
  cycle: PlayerLocomotionGaitCycle,
  controls: PlayerCharacterControlRig,
  root: THREE.Object3D,
  planarSpeed: number,
  travelMeters: number,
  sign = 1,
): void {
  if (Math.abs(travelMeters) <= 0) {
    return;
  }
  root.position.x += travelMeters;
  root.updateMatrixWorld(true);
  cycle.update(
    controls,
    createInput({
      isSideStep: true,
      isWallIdle: false,
      sideStepSign: sign,
      sideStepLateralSpeed: planarSpeed * sign,
      planarSpeed,
      characterRoot: root,
      deltaSeconds: Math.abs(travelMeters) / Math.max(1e-4, planarSpeed),
    }),
  );
}

describe('PlayerLocomotionGaitCycle', () => {
  it('places opposite feet forward and back while walking', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    let opposite = 0;
    let samples = 0;
    for (let step = 0; step < 90; step++) {
      cycle.update(controls, createInput());
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
  });

  it('keeps feet near rest when settled', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    cycle.update(controls, createInput({ planarSpeed: 0 }));
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.z)).toBeLessThan(0.05);
    expect(Math.abs(right.z)).toBeLessThan(0.05);
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(0);
  });

  it('opens the left lead foot while the right stays planted', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 1.2;
    const step = resolveStepLength(speed);
    const openTravel = step * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction * 0.45;
    enterSideStep(cycle, controls, root, speed);
    const planted = localControlToWorld(root, controls.get(PLAYER_CHARACTER_CONTROL.footRight));
    travelSideStep(cycle, controls, root, speed, openTravel);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const rightWorld = localControlToWorld(root, controls.get(PLAYER_CHARACTER_CONTROL.footRight));
    expect(left.x).toBeGreaterThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.04);
    expect(rightWorld.x).toBeCloseTo(planted.x, 3);
  });

  it('keeps the planted trail foot fixed while the body translates during open', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 1.2;
    const step = resolveStepLength(speed);
    const openTravel = step * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction * 0.35;
    enterSideStep(cycle, controls, root, speed);
    travelSideStep(cycle, controls, root, speed, openTravel);
    const plantedBefore = localControlToWorld(root, controls.get(PLAYER_CHARACTER_CONTROL.footRight));
    root.position.x += 0.04;
    root.updateMatrixWorld(true);
    cycle.update(
      controls,
      createInput({
        isSideStep: true,
        isWallIdle: false,
        sideStepSign: 1,
        sideStepLateralSpeed: speed,
        planarSpeed: speed,
        characterRoot: root,
        deltaSeconds: 0.01,
      }),
    );
    const plantedAfter = localControlToWorld(root, controls.get(PLAYER_CHARACTER_CONTROL.footRight));
    expect(plantedAfter.x).toBeCloseTo(plantedBefore.x, 3);
  });

  it('keeps side-step foot local height near ground when the root elevates', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 1.2;
    enterSideStep(cycle, controls, root, speed);
    root.position.y += 1.2;
    root.updateMatrixWorld(true);
    cycle.update(
      controls,
      createInput({
        isSideStep: true,
        isWallIdle: false,
        sideStepSign: 1,
        sideStepLateralSpeed: speed,
        planarSpeed: speed,
        characterRoot: root,
        deltaSeconds: 1 / 60,
      }),
    );
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(left.y).toBeGreaterThan(PLAYER_LOCOMOTION_GAIT.footGroundYMeters - 0.05);
    expect(left.y).toBeLessThan(PLAYER_LOCOMOTION_GAIT.footGroundYMeters + 0.12);
    expect(right.y).toBeGreaterThan(PLAYER_LOCOMOTION_GAIT.footGroundYMeters - 0.05);
    expect(right.y).toBeLessThan(PLAYER_LOCOMOTION_GAIT.footGroundYMeters + 0.12);
  });

  it('opens the right lead foot when side-stepping right', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 1.2;
    const step = resolveStepLength(speed);
    const openTravel = step * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction * 0.45;
    enterSideStep(cycle, controls, root, speed, -1);
    travelSideStep(cycle, controls, root, speed, -openTravel, -1);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(right.x).toBeLessThan(-PLAYER_LOCOMOTION_GAIT.stanceWidthMeters - 0.04);
    expect(left.x).toBeGreaterThan(0);
  });

  it('moves the trail foot during close after the lead plants', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 1.2;
    const step = resolveStepLength(speed);
    const openEnd = step * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction;
    enterSideStep(cycle, controls, root, speed);
    travelSideStep(cycle, controls, root, speed, openEnd + 0.001);
    const trailStart = localControlToWorld(root, controls.get(PLAYER_CHARACTER_CONTROL.footRight));
    travelSideStep(cycle, controls, root, speed, (step - openEnd) * 0.7);
    const trailEnd = localControlToWorld(root, controls.get(PLAYER_CHARACTER_CONTROL.footRight));
    expect(trailStart.distanceTo(trailEnd)).toBeGreaterThan(0.08);
  });

  it('matches lead progress to traveled distance independent of frame time', () => {
    const speed = 2;
    const travel = 0.14;
    const oneFrame = sampleLeadAfterTravel(speed, travel, 1);
    const manyFrames = sampleLeadAfterTravel(speed, travel, 12);
    expect(Math.abs(oneFrame - manyFrames)).toBeLessThan(0.02);
  });

  it('keeps feet under the body when root travels several step lengths in one frame', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 8;
    const step = resolveStepLength(speed);
    const travel = step * 3.2;
    enterSideStep(cycle, controls, root, speed);
    root.position.x += travel;
    root.updateMatrixWorld(true);
    cycle.update(
      controls,
      createInput({
        isSideStep: true,
        isWallIdle: false,
        sideStepSign: 1,
        sideStepLateralSpeed: speed,
        planarSpeed: speed,
        characterRoot: root,
        deltaSeconds: travel / speed,
      }),
    );
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.x)).toBeLessThan(step + PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.2);
    expect(Math.abs(right.x)).toBeLessThan(step + PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.2);
  });

  it('does not invent travel when the root yaw changes far from the world origin', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.position.set(40, 0, 25);
    root.updateMatrixWorld(true);
    const speed = 2;
    enterSideStep(cycle, controls, root, speed);
    root.rotation.y = Math.PI * 0.5;
    root.updateMatrixWorld(true);
    cycle.update(
      controls,
      createInput({
        isSideStep: true,
        isWallIdle: false,
        sideStepSign: 1,
        sideStepLateralSpeed: speed,
        planarSpeed: speed,
        characterRoot: root,
        deltaSeconds: 1 / 60,
      }),
    );
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.08);
    expect(Math.abs(right.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.08);
    expect(Math.abs(left.z)).toBeLessThan(0.08);
    expect(Math.abs(right.z)).toBeLessThan(0.08);
  });

  it('does not advance feet when the root is stuck despite high planar speed', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 5;
    const step = resolveStepLength(speed);
    const openTravel = step * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction * 0.5;
    enterSideStep(cycle, controls, root, speed);
    travelSideStep(cycle, controls, root, speed, openTravel);
    const leftBefore = controls.get(PLAYER_CHARACTER_CONTROL.footLeft).x;
    for (let frame = 0; frame < 30; frame++) {
      cycle.update(
        controls,
        createInput({
          isSideStep: true,
          isWallIdle: false,
          sideStepSign: 1,
          sideStepLateralSpeed: 0,
          planarSpeed: speed,
          characterRoot: root,
          deltaSeconds: 1 / 60,
        }),
      );
    }
    const leftAfter = controls.get(PLAYER_CHARACTER_CONTROL.footLeft).x;
    expect(leftAfter).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.05);
    expect(leftAfter).toBeLessThan(leftBefore);
  });

  it('reseeds desired feet under the body when lateral velocity reverses mid-step', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 2;
    const step = resolveStepLength(speed);
    const openTravel = step * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction * 0.6;
    enterSideStep(cycle, controls, root, speed);
    travelSideStep(cycle, controls, root, speed, openTravel);
    expect(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).x).toBeGreaterThan(
      PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.05,
    );
    cycle.update(
      controls,
      createInput({
        isSideStep: true,
        isWallIdle: false,
        sideStepSign: 1,
        sideStepLateralSpeed: -PLAYER_LOCOMOTION_GAIT.sideStepContraryVelocityMetersPerSecond,
        planarSpeed: speed,
        characterRoot: root,
        deltaSeconds: 1 / 60,
      }),
    );
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.08);
    expect(Math.abs(right.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.08);
    expect(Math.abs(left.z)).toBeLessThan(0.08);
    expect(Math.abs(right.z)).toBeLessThan(0.08);
  });

  it('writes jump desired feet when airborne', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    cycle.update(controls, createInput({ isGrounded: false, planarSpeed: 0, verticalVelocity: -6 }));
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(right.z).toBeGreaterThan(0.25);
    expect(right.y).toBeGreaterThan(left.y + 0.05);
    expect(Math.abs(left.z)).toBeLessThan(0.08);
  });

  it('switches to jump feet when falling while still holding movement input', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    cycle.update(controls, createInput({ planarSpeed: 3 }));
    cycle.update(controls, createInput({ isGrounded: false, planarSpeed: 3, verticalVelocity: -0.5 }));
    expect(cycle.consumeNeedsControlSnap()).toBe(true);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(right.z).toBeGreaterThan(0.25);
    expect(right.y).toBeGreaterThan(left.y + 0.05);
  });

  it('uses jump feet while airborne with run speed and mild fall velocity', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    cycle.update(controls, createInput({ planarSpeed: 10, wantsRun: true }));
    cycle.update(
      controls,
      createInput({
        isGrounded: false,
        planarSpeed: 10,
        wantsRun: true,
        verticalVelocity: -1.2,
      }),
    );
    expect(cycle.consumeNeedsControlSnap()).toBe(true);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(right.z).toBeGreaterThan(0.25);
    expect(right.y).toBeGreaterThan(left.y + 0.05);
  });

  it('places side-step desired feet under the body when entering at high speed', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 8;
    for (let step = 0; step < 20; step++) {
      cycle.update(controls, createInput({ planarSpeed: speed, characterRoot: root }));
    }
    const leftWalkZ = Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z);
    expect(leftWalkZ).toBeGreaterThan(0.05);
    enterSideStep(cycle, controls, root, speed);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.08);
    expect(Math.abs(right.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.08);
    expect(Math.abs(left.z)).toBeLessThan(0.08);
    expect(Math.abs(right.z)).toBeLessThan(0.08);
    expect(Math.abs(left.x - right.x)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.sideStepMaxLengthMeters + 0.05);
  });

  it('reseeds plants from character center and wall angle, discarding walk offsets', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.position.set(3, 0, 5);
    root.rotation.y = 0.7;
    root.updateMatrixWorld(true);
    const speed = 6;
    for (let step = 0; step < 30; step++) {
      cycle.update(controls, createInput({ planarSpeed: speed, characterRoot: root }));
    }
    expect(Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z)).toBeGreaterThan(0.05);
    const wallNormal = new THREE.Vector3(0, 0, -1);
    cycle.update(
      controls,
      createInput({
        isSideStep: true,
        isWallIdle: false,
        sideStepSign: 1,
        sideStepLateralSpeed: speed,
        planarSpeed: speed,
        characterRoot: root,
        wallNormalWorld: wallNormal,
        deltaSeconds: 0,
      }),
    );
    expect(cycle.consumeNeedsControlSnap()).toBe(false);
    const leftLocal = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const rightLocal = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    const leftWorld = localControlToWorld(root, leftLocal);
    const rightWorld = localControlToWorld(root, rightLocal);
    expect(leftWorld.distanceTo(root.position)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.12);
    expect(rightWorld.distanceTo(root.position)).toBeLessThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters + 0.12);
    expect(Math.abs(leftWorld.z - root.position.z)).toBeLessThan(0.08);
    expect(Math.abs(rightWorld.z - root.position.z)).toBeLessThan(0.08);
    expect(leftWorld.x).toBeGreaterThan(rightWorld.x);
    expect(leftLocal.x).toBeGreaterThan(0);
    expect(rightLocal.x).toBeLessThan(0);
  });

  it('advances cycle phase while moving', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const before = cycle.getCyclePhaseRadians();
    for (let step = 0; step < 30; step++) {
      cycle.update(controls, createInput());
    }
    expect(cycle.getCyclePhaseRadians()).toBeGreaterThan(before + 0.5);
  });

  it('queues walk footstep plants as feet return to stance', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    let leftPlants = 0;
    let rightPlants = 0;
    for (let step = 0; step < 180; step++) {
      cycle.update(controls, createInput({ planarSpeed: 3.5, deltaSeconds: 1 / 60 }));
      if (cycle.consumeFootstepLeftPending()) {
        leftPlants += 1;
      }
      if (cycle.consumeFootstepRightPending()) {
        rightPlants += 1;
      }
    }
    expect(leftPlants).toBeGreaterThan(1);
    expect(rightPlants).toBeGreaterThan(1);
  });

  it('queues a lead-foot plant when side-step open completes', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 1.2;
    const step = resolveStepLength(speed);
    const openTravel = step * PLAYER_LOCOMOTION_GAIT.sideStepOpenFraction + 0.001;
    enterSideStep(cycle, controls, root, speed);
    cycle.consumeFootstepLeftPending();
    cycle.consumeFootstepRightPending();
    travelSideStep(cycle, controls, root, speed, openTravel);
    expect(cycle.consumeFootstepLeftPending()).toBe(true);
  });

  it('snaps to jump feet and drops side-step plants when leaving the ground', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const speed = 2;
    enterSideStep(cycle, controls, root, speed);
    travelSideStep(cycle, controls, root, speed, 0.2);
    const midLeft = controls.get(PLAYER_CHARACTER_CONTROL.footLeft).clone();
    expect(Math.abs(midLeft.x)).toBeGreaterThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters);
    cycle.update(
      controls,
      createInput({
        isGrounded: false,
        isSideStep: false,
        isWallIdle: false,
        planarSpeed: 2,
        verticalVelocity: 6,
        characterRoot: root,
      }),
    );
    expect(cycle.consumeNeedsControlSnap()).toBe(true);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(right.z).toBeGreaterThan(0.25);
    expect(right.y).toBeGreaterThan(left.y);
    expect(Math.abs(left.z)).toBeLessThan(0.08);
  });

  it('does not keep writing side-step world plants while airborne after wall contact', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.position.set(0, 5, 0);
    root.updateMatrixWorld(true);
    for (let step = 0; step < 10; step++) {
      cycle.update(
        controls,
        createInput({
          isGrounded: false,
          isSideStep: true,
          isWallIdle: false,
          sideStepSign: 1,
          sideStepLateralSpeed: 2,
          planarSpeed: 0,
          verticalVelocity: -6,
          characterRoot: root,
          wallNormalWorld: new THREE.Vector3(0, 0, -1),
        }),
      );
      root.position.y -= 0.3;
      root.updateMatrixWorld(true);
    }
    const left = controls.get(PLAYER_CHARACTER_CONTROL.footLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.footRight);
    expect(Math.abs(left.x)).toBeLessThan(0.2);
    expect(Math.abs(right.x)).toBeLessThan(0.2);
    expect(right.z).toBeGreaterThan(0.2);
  });

  it('resumes walk feet after air exit instead of freezing under the body', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    enterSideStep(cycle, controls, root, 2);
    travelSideStep(cycle, controls, root, 2, 0.25);
    cycle.update(
      controls,
      createInput({ isGrounded: false, planarSpeed: 3, verticalVelocity: -6, characterRoot: root }),
    );
    expect(cycle.consumeNeedsControlSnap()).toBe(true);
    let sawStride = false;
    for (let step = 0; step < 90; step++) {
      cycle.update(controls, createInput({ planarSpeed: 3.5, characterRoot: root }));
      const leftZ = Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z);
      const rightZ = Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.footRight).z);
      if (leftZ > 0.08 || rightZ > 0.08) {
        sawStride = true;
      }
    }
    expect(sawStride).toBe(true);
  });

  it('reset restores free walk after a corrupted side-step plant state', () => {
    const cycle = new PlayerLocomotionGaitCycle();
    const controls = new PlayerCharacterControlRig();
    const root = new THREE.Object3D();
    root.position.set(20, 0, 20);
    root.updateMatrixWorld(true);
    enterSideStep(cycle, controls, root, 2);
    cycle.update(
      controls,
      createInput({ isGrounded: false, planarSpeed: 0, verticalVelocity: -6, characterRoot: root }),
    );
    cycle.reset();
    let sawStride = false;
    for (let step = 0; step < 90; step++) {
      cycle.update(controls, createInput({ planarSpeed: 3.5, characterRoot: root }));
      if (Math.abs(controls.get(PLAYER_CHARACTER_CONTROL.footLeft).z) > 0.08) {
        sawStride = true;
      }
    }
    expect(sawStride).toBe(true);
  });
});

/**
 * Samples left foot local X after entering side-step and traveling a fixed
 * distance.
 *
 * @param planarSpeed Planar speed.
 * @param travelMeters Distance to travel.
 * @param frameCount Number of equal frames that sum to the travel.
 * @returns Left foot local X.
 */
function sampleLeadAfterTravel(planarSpeed: number, travelMeters: number, frameCount: number): number {
  const cycle = new PlayerLocomotionGaitCycle();
  const controls = new PlayerCharacterControlRig();
  const root = new THREE.Object3D();
  root.updateMatrixWorld(true);
  enterSideStep(cycle, controls, root, planarSpeed);
  const perFrame = travelMeters / frameCount;
  for (let frame = 0; frame < frameCount; frame++) {
    travelSideStep(cycle, controls, root, planarSpeed, perFrame);
  }
  return controls.get(PLAYER_CHARACTER_CONTROL.footLeft).x;
}
