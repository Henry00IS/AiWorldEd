import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import { playerCharacterLoadModelFromArrayBuffer } from '@/player/character/player_character_model_loader.js';
import { PlayerCharacterRagdoll } from '@/player/character/player_character_ragdoll.js';
import {
  playerCharacterBuildRig,
  playerCharacterCopyRightHand,
  type PlayerCharacterRig,
} from '@/player/character/player_character_rig.js';

const STEP = 1 / 60;

/**
 * Puts the rig back on its animated (rest) pose at a place, as the animation
 * does every frame before the ragdoll.
 *
 * @param rig Rig.
 * @param position Feet position.
 */
function animate(rig: PlayerCharacterRig, position: THREE.Vector3): void {
  rig.root.position.copy(position);
  rig.bones.forEach((bone, id) => bone.quaternion.copy(rig.restLocalQuaternions.get(id) ?? bone.quaternion));
  rig.root.updateMatrixWorld(true);
}

/**
 * Returns a bone's world position.
 *
 * @param rig Rig.
 * @param id Bone.
 * @returns Position.
 */
function at(rig: PlayerCharacterRig, id: (typeof PLAYER_CHARACTER_BONE)[keyof typeof PLAYER_CHARACTER_BONE]) {
  return rig.bones.get(id)?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
}

describe('PlayerCharacterRagdoll', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
    await playerCharacterLoadModelFromArrayBuffer(
      readFileSync(resolve(process.cwd(), 'src/player/assets/character.glb')),
    );
  });

  it('goes limp in flight, reaches for the anchor, keeps limbs out of the body and blends back on landing', () => {
    const rig = playerCharacterBuildRig();
    const ragdoll = new PlayerCharacterRagdoll();
    const feet = new THREE.Vector3();
    const velocity = new THREE.Vector3(0, 6, 24);
    const anchor = new THREE.Vector3(0, 20, 30);
    let swing = 0;
    for (let frame = 0; frame < 60; frame++) {
      feet.addScaledVector(velocity, STEP);
      animate(rig, feet);
      const animatedHand = at(rig, PLAYER_CHARACTER_BONE.handLeft);
      ragdoll.apply(rig, true, anchor, velocity, STEP);
      swing = Math.max(swing, at(rig, PLAYER_CHARACTER_BONE.handLeft).distanceTo(animatedHand));
    }
    expect(ragdoll.getWeight()).toBeGreaterThan(0.99);
    expect(swing).toBeGreaterThan(0.03);
    const shoulder = at(rig, PLAYER_CHARACTER_BONE.upperArmRight);
    const hand = new THREE.Vector3();
    expect(playerCharacterCopyRightHand(rig, hand)).toBe(true);
    const reach = hand.sub(shoulder).normalize();
    expect(reach.dot(anchor.clone().sub(shoulder).normalize())).toBeGreaterThan(0.85);
    rig.bones.forEach((bone) => expect(Number.isFinite(bone.quaternion.w)).toBe(true));
    for (let frame = 0; frame < 60; frame++) {
      animate(rig, feet);
      ragdoll.apply(rig, false, null, new THREE.Vector3(), STEP);
    }
    expect(ragdoll.getWeight()).toBe(0);
    rig.bones.forEach((bone, id) =>
      expect(bone.quaternion.angleTo(rig.restLocalQuaternions.get(id) ?? bone.quaternion)).toBeCloseTo(0, 2),
    );
    ragdoll.dispose();
  });

  it('keeps the arm out of the body when it reaches across it', () => {
    const rig = playerCharacterBuildRig();
    const ragdoll = new PlayerCharacterRagdoll();
    const feet = new THREE.Vector3();
    const velocity = new THREE.Vector3(24, 4, 0);
    let closest = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < 90; frame++) {
      feet.addScaledVector(velocity, STEP);
      animate(rig, feet);
      ragdoll.apply(rig, true, feet.clone().add(new THREE.Vector3(30, 2, 0)), velocity, STEP);
      const torso = new THREE.Line3(at(rig, PLAYER_CHARACTER_BONE.hips), at(rig, PLAYER_CHARACTER_BONE.head));
      [PLAYER_CHARACTER_BONE.lowerArmRight, PLAYER_CHARACTER_BONE.handRight].forEach((id) => {
        const point = at(rig, id);
        closest = Math.min(closest, torso.closestPointToPoint(point, true, new THREE.Vector3()).distanceTo(point));
      });
    }
    expect(closest).toBeGreaterThan(0.1);
    ragdoll.dispose();
  });

  it('keeps the head looking where the animation (the player\'s look) turns it while the body is limp', () => {
    const rig = playerCharacterBuildRig();
    const ragdoll = new PlayerCharacterRagdoll();
    const feet = new THREE.Vector3();
    const velocity = new THREE.Vector3(0, 8, 24);
    const head = rig.bones.get(PLAYER_CHARACTER_BONE.head);
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0.9, 0));
    let worst = 0;
    for (let frame = 0; frame < 60; frame++) {
      feet.addScaledVector(velocity, STEP);
      animate(rig, feet);
      head?.quaternion.multiply(look);
      rig.root.updateMatrixWorld(true);
      const looking = head?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
      ragdoll.apply(rig, true, feet.clone().add(new THREE.Vector3(0, 20, 30)), velocity, STEP);
      worst = Math.max(worst, head?.getWorldQuaternion(new THREE.Quaternion()).angleTo(looking) ?? Infinity);
    }
    expect(ragdoll.getWeight()).toBeGreaterThan(0.99);
    expect(worst).toBeLessThan(1e-3);
    ragdoll.dispose();
  });
});
