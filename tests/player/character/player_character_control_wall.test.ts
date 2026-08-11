import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PlayerLocomotionWallPush } from '@/player/character/locomotion/player_locomotion_wall_push.js';
import { PLAYER_COLLIDER_RADIUS_METERS, PLAYER_WALL_SKIN_METERS } from '@/player/player_constants.js';

describe('PlayerLocomotionWallPush', () => {
  it('places both hands short of capsule contact depth on free-space side', () => {
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    wall.blendOnto(controls, root, new THREE.Vector3(0, 0, -1), 1);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    const contact = PLAYER_COLLIDER_RADIUS_METERS + PLAYER_WALL_SKIN_METERS;
    expect(left.z).toBeGreaterThan(0.25);
    expect(left.z).toBeLessThan(contact);
    expect(right.z).toBeGreaterThan(0.25);
    expect(right.z).toBeLessThan(contact);
    expect(left.x).toBeGreaterThan(0.1);
    expect(right.x).toBeLessThan(-0.1);
  });

  it('keeps hands on opposite sides for any planar wall normal', () => {
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    wall.blendOnto(controls, root, new THREE.Vector3(-1, 0, 0), 1);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    expect(left.distanceTo(right)).toBeGreaterThan(0.25);
  });

  it('places hands in front of the body when facing a global +X wall', () => {
    const root = new THREE.Object3D();
    root.rotation.y = Math.PI * 0.5;
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    wall.blendOnto(controls, root, new THREE.Vector3(-1, 0, 0), 1, 1);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    expect(left.z).toBeGreaterThan(0.15);
    expect(right.z).toBeGreaterThan(0.15);
    expect(left.z).toBeGreaterThan(Math.abs(left.x) * 0.25);
    expect(right.z).toBeGreaterThan(Math.abs(right.x) * 0.25);
  });

  it('still places hands in front when the wall normal points the wrong way', () => {
    const root = new THREE.Object3D();
    root.rotation.y = Math.PI * 0.5;
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    wall.blendOnto(controls, root, new THREE.Vector3(1, 0, 0), 1, 1);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const right = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    expect(left.z).toBeGreaterThan(0.15);
    expect(right.z).toBeGreaterThan(0.15);
  });

  it('places elbow poles on opposite sides and below the hands', () => {
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    wall.blendOnto(controls, root, new THREE.Vector3(0, 0, -1), 1);
    const leftHand = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const rightHand = controls.get(PLAYER_CHARACTER_CONTROL.handRight);
    const leftElbow = controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleLeft);
    const rightElbow = controls.get(PLAYER_CHARACTER_CONTROL.elbowPoleRight);
    expect(leftElbow.x).toBeGreaterThan(0.05);
    expect(rightElbow.x).toBeLessThan(-0.05);
    expect(leftElbow.y).toBeLessThan(leftHand.y - 0.1);
    expect(rightElbow.y).toBeLessThan(rightHand.y - 0.1);
    expect(leftElbow.z).toBeLessThan(leftHand.z);
    expect(rightElbow.z).toBeLessThan(rightHand.z);
  });

  it('blends free arm controls toward wall palms by weight', () => {
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    controls.set(PLAYER_CHARACTER_CONTROL.handLeft, 0.25, 0.9, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.handRight, -0.25, 0.9, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleLeft, 0.3, 0.7, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleRight, -0.3, 0.7, 0.05);
    wall.blendOnto(controls, root, new THREE.Vector3(0, 0, -1), 0.5);
    const left = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    expect(left.z).toBeGreaterThan(0.15);
    expect(left.z).toBeLessThan(0.35);
  });

  it('does not fully retarget palms on the first frame of a 90-degree wall switch', () => {
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    wall.blendOnto(controls, root, new THREE.Vector3(0, 0, -1), 1, 1 / 60);
    const leftBefore = controls.get(PLAYER_CHARACTER_CONTROL.handLeft).clone();
    wall.blendOnto(controls, root, new THREE.Vector3(-1, 0, 0), 1, 1 / 60);
    const leftAfter = controls.get(PLAYER_CHARACTER_CONTROL.handLeft);
    const fullySwitched = new PlayerCharacterControlRig();
    const wallInstant = new PlayerLocomotionWallPush();
    wallInstant.blendOnto(fullySwitched, root, new THREE.Vector3(-1, 0, 0), 1, 1);
    const target = fullySwitched.get(PLAYER_CHARACTER_CONTROL.handLeft);
    expect(leftAfter.distanceTo(leftBefore)).toBeGreaterThan(0.01);
    expect(leftAfter.distanceTo(target)).toBeGreaterThan(0.05);
  });

  it('keeps blending with a cached wall normal after contact ends', () => {
    const root = new THREE.Object3D();
    root.updateMatrixWorld(true);
    const wall = new PlayerLocomotionWallPush();
    const controls = new PlayerCharacterControlRig();
    controls.set(PLAYER_CHARACTER_CONTROL.handLeft, 0.25, 0.9, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.handRight, -0.25, 0.9, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleLeft, 0.3, 0.7, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleRight, -0.3, 0.7, 0.05);
    wall.blendOnto(controls, root, new THREE.Vector3(0, 0, -1), 1);
    controls.set(PLAYER_CHARACTER_CONTROL.handLeft, 0.25, 0.9, 0.05);
    controls.set(PLAYER_CHARACTER_CONTROL.handRight, -0.25, 0.9, 0.05);
    wall.blendOnto(controls, root, new THREE.Vector3(0, 0, 0), 0.5);
    expect(controls.get(PLAYER_CHARACTER_CONTROL.handLeft).z).toBeGreaterThan(0.15);
  });
});
