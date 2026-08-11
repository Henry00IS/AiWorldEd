import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import { PlayerCharacterControlIk } from '@/player/character/player_character_control_ik.js';
import { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';

/**
 * Builds a minimal biped with Y-down legs and Y-up arms.
 *
 * @returns Root, bones, and rest maps.
 */
function createBipedRig(): {
  root: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
  rest: Map<string, THREE.Quaternion>;
} {
  const root = new THREE.Object3D();
  const hips = new THREE.Bone();
  hips.position.set(0, 1, 0);
  root.add(hips);
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, THREE.Quaternion>();
  addLeg(hips, bones, rest, true);
  addLeg(hips, bones, rest, false);
  const chest = new THREE.Bone();
  chest.position.set(0, 0.2, 0);
  hips.add(chest);
  addArm(chest, bones, rest, true);
  addArm(chest, bones, rest, false);
  root.updateMatrixWorld(true);
  return { root, bones, rest };
}

/**
 * Adds one leg chain under hips.
 *
 * @param hips Hips bone.
 * @param bones Bone map.
 * @param rest Rest map.
 * @param isLeft Left leg.
 */
function addLeg(
  hips: THREE.Bone,
  bones: Map<string, THREE.Bone>,
  rest: Map<string, THREE.Quaternion>,
  isLeft: boolean,
): void {
  const side = isLeft ? 0.1 : -0.1;
  const upper = new THREE.Bone();
  const lower = new THREE.Bone();
  const foot = new THREE.Bone();
  upper.position.set(side, 0, 0);
  lower.position.set(0, -0.45, 0);
  foot.position.set(0, -0.45, 0);
  hips.add(upper);
  upper.add(lower);
  lower.add(foot);
  const upperId = isLeft ? PLAYER_CHARACTER_BONE.upperLegLeft : PLAYER_CHARACTER_BONE.upperLegRight;
  const lowerId = isLeft ? PLAYER_CHARACTER_BONE.lowerLegLeft : PLAYER_CHARACTER_BONE.lowerLegRight;
  const footId = isLeft ? PLAYER_CHARACTER_BONE.footLeft : PLAYER_CHARACTER_BONE.footRight;
  bones.set(upperId, upper);
  bones.set(lowerId, lower);
  bones.set(footId, foot);
  rest.set(upperId, upper.quaternion.clone());
  rest.set(lowerId, lower.quaternion.clone());
  rest.set(footId, foot.quaternion.clone());
}

/**
 * Adds one arm chain under chest.
 *
 * @param chest Chest bone.
 * @param bones Bone map.
 * @param rest Rest map.
 * @param isLeft Left arm.
 */
function addArm(
  chest: THREE.Bone,
  bones: Map<string, THREE.Bone>,
  rest: Map<string, THREE.Quaternion>,
  isLeft: boolean,
): void {
  const side = isLeft ? 0.18 : -0.18;
  const upper = new THREE.Bone();
  const lower = new THREE.Bone();
  const hand = new THREE.Bone();
  upper.position.set(side, 0.05, 0);
  lower.position.set(0, 0.3, 0);
  hand.position.set(0, 0.28, 0);
  chest.add(upper);
  upper.add(lower);
  lower.add(hand);
  const upperId = isLeft ? PLAYER_CHARACTER_BONE.upperArmLeft : PLAYER_CHARACTER_BONE.upperArmRight;
  const lowerId = isLeft ? PLAYER_CHARACTER_BONE.lowerArmLeft : PLAYER_CHARACTER_BONE.lowerArmRight;
  const handId = isLeft ? PLAYER_CHARACTER_BONE.handLeft : PLAYER_CHARACTER_BONE.handRight;
  bones.set(upperId, upper);
  bones.set(lowerId, lower);
  bones.set(handId, hand);
  rest.set(upperId, upper.quaternion.clone());
  rest.set(lowerId, lower.quaternion.clone());
  rest.set(handId, hand.quaternion.clone());
}

/**
 * Reads the world rotation axes of a bone (scale-free).
 *
 * @param bone Bone to sample.
 * @returns Unit X/Y/Z axes in world space.
 */
function readWorldAxes(bone: THREE.Bone): { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 } {
  const rotationOnly = new THREE.Matrix4().extractRotation(bone.matrixWorld);
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  rotationOnly.extractBasis(x, y, z);
  return { x, y, z };
}

describe('PlayerCharacterControlIk', () => {
  it('moves a foot end effector toward its control point by rotation only', () => {
    const { root, bones, rest } = createBipedRig();
    const controls = new PlayerCharacterControlRig();
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, 0.1, 0.05, 0.25);
    controls.set(PLAYER_CHARACTER_CONTROL.kneePoleLeft, 0.1, 0.5, 0.4);
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, -0.1, 0.05, -0.1);
    controls.set(PLAYER_CHARACTER_CONTROL.kneePoleRight, -0.1, 0.5, 0.4);
    const lower = bones.get(PLAYER_CHARACTER_BONE.lowerLegLeft)!;
    const foot = bones.get(PLAYER_CHARACTER_BONE.footLeft)!;
    const lowerPos = lower.position.clone();
    const before = new THREE.Vector3();
    foot.getWorldPosition(before);
    const ik = new PlayerCharacterControlIk();
    ik.apply(bones as never, rest as never, root, controls, {
      solveLegs: true,
      solveArms: false,
      handOrient: 'none',
    });
    root.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    foot.getWorldPosition(after);
    const target = new THREE.Vector3(0.1, 0.05, 0.25);
    expect(after.distanceTo(target)).toBeLessThan(before.distanceTo(target));
    expect(lower.position.equals(lowerPos)).toBe(true);
  });

  it('yaws free hands inward so thumbs face the pelvis', () => {
    const { root, bones, rest } = createBipedRig();
    const controls = new PlayerCharacterControlRig();
    controls.set(PLAYER_CHARACTER_CONTROL.handLeft, 0.2, 0.9, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.handRight, -0.2, 0.9, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleLeft, 0.28, 0.7, -0.1);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleRight, -0.28, 0.7, -0.1);
    const left = bones.get(PLAYER_CHARACTER_BONE.handLeft)!;
    const right = bones.get(PLAYER_CHARACTER_BONE.handRight)!;
    const ik = new PlayerCharacterControlIk();
    ik.apply(bones as never, rest as never, root, controls, {
      solveLegs: false,
      solveArms: true,
      handOrient: 'none',
    });
    root.updateMatrixWorld(true);
    const leftBefore = left.quaternion.clone();
    const rightBefore = right.quaternion.clone();
    ik.apply(bones as never, rest as never, root, controls, {
      solveLegs: false,
      solveArms: true,
      handOrient: 'palm_inward',
      handInwardYawRadians: 0.35,
    });
    expect(left.quaternion.angleTo(leftBefore)).toBeGreaterThan(0.2);
    expect(right.quaternion.angleTo(rightBefore)).toBeGreaterThan(0.2);
  });

  it('orients wall palms with fingers up and opposite thumb laterality', () => {
    const { root, bones, rest } = createBipedRig();
    const controls = new PlayerCharacterControlRig();
    controls.set(PLAYER_CHARACTER_CONTROL.handLeft, 0.2, 1.2, 0.3);
    controls.set(PLAYER_CHARACTER_CONTROL.handRight, -0.2, 1.2, 0.3);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleLeft, 0.25, 0.95, 0.15);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleRight, -0.25, 0.95, 0.15);
    const wallNormalLocalOut = new THREE.Vector3(0, 0, -1);
    const ik = new PlayerCharacterControlIk();
    ik.apply(bones as never, rest as never, root, controls, {
      solveLegs: false,
      solveArms: true,
      handOrient: 'palm_wall',
      wallNormalLocalOut,
    });
    root.updateMatrixWorld(true);
    const left = readWorldAxes(bones.get(PLAYER_CHARACTER_BONE.handLeft)!);
    const right = readWorldAxes(bones.get(PLAYER_CHARACTER_BONE.handRight)!);
    const intoWall = wallNormalLocalOut.clone().multiplyScalar(-1);
    expect(left.y.y).toBeGreaterThan(0.9);
    expect(right.y.y).toBeGreaterThan(0.9);
    expect(Math.abs(left.x.dot(intoWall))).toBeGreaterThan(0.9);
    expect(Math.abs(right.x.dot(intoWall))).toBeGreaterThan(0.9);
    expect(left.z.dot(right.z)).toBeLessThan(-0.9);
  });
});
