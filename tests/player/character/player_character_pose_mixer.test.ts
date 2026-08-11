import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  PLAYER_CHARACTER_MIXER_BONES,
  playerCharacterApplyBaseLocomotionPose,
} from '@/player/character/player_character_pose_mixer.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import {
  playerCharacterCreatePoseWeights,
  type PlayerCharacterPoseWeights,
} from '@/player/character/player_character_pose_weights.js';

/**
 * Builds identity rest bones for every mixer bone id.
 *
 * @returns Bones and rest quaternion maps.
 */
function createMixerRig(): {
  bones: Map<string, THREE.Bone>;
  rest: Map<string, THREE.Quaternion>;
} {
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, THREE.Quaternion>();
  for (let index = 0; index < PLAYER_CHARACTER_MIXER_BONES.length; index++) {
    const boneId = PLAYER_CHARACTER_MIXER_BONES[index];
    if (!boneId) {
      continue;
    }
    const bone = new THREE.Bone();
    bones.set(boneId, bone);
    rest.set(boneId, new THREE.Quaternion());
  }
  return { bones, rest };
}

/**
 * Forces pure walk weights.
 *
 * @returns Walk-only pose weights.
 */
function createWalkWeights(): PlayerCharacterPoseWeights {
  const weights = playerCharacterCreatePoseWeights();
  weights.idle = 0;
  weights.walk = 1;
  weights.run = 0;
  weights.air = 0;
  weights.wall = 0;
  return weights;
}

/**
 * Forces pure run weights.
 *
 * @returns Run-only pose weights.
 */
function createRunWeights(): PlayerCharacterPoseWeights {
  const weights = playerCharacterCreatePoseWeights();
  weights.idle = 0;
  weights.walk = 0;
  weights.run = 1;
  weights.air = 0;
  weights.wall = 0;
  return weights;
}

/**
 * Reads XYZ euler from a bone local quaternion.
 *
 * @param bone Bone to sample.
 * @returns Euler XYZ.
 */
function readBoneEuler(bone: THREE.Bone): THREE.Euler {
  return new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
}

describe('playerCharacterApplyBaseLocomotionPose', () => {
  it('yaws hips toward the lead leg', () => {
    const { bones, rest } = createMixerRig();
    const weights = createWalkWeights();
    const hips = bones.get(PLAYER_CHARACTER_BONE.hips)!;
    playerCharacterApplyBaseLocomotionPose(bones as never, rest as never, {
      planarSpeed: 2,
      verticalVelocity: 0,
      cyclePhaseRadians: 0,
      weights,
    });
    expect(readBoneEuler(hips).y).toBeGreaterThan(0.04);
  });

  it('leans the torso hard forward while running', () => {
    const { bones, rest } = createMixerRig();
    const weights = createRunWeights();
    const hips = bones.get(PLAYER_CHARACTER_BONE.hips)!;
    const spine = bones.get(PLAYER_CHARACTER_BONE.spine)!;
    const head = bones.get(PLAYER_CHARACTER_BONE.head)!;
    playerCharacterApplyBaseLocomotionPose(bones as never, rest as never, {
      planarSpeed: 9,
      verticalVelocity: 0,
      cyclePhaseRadians: 0,
      weights,
    });
    expect(readBoneEuler(hips).x).toBeGreaterThan(0.4);
    expect(readBoneEuler(spine).x).toBeGreaterThan(0.3);
    expect(readBoneEuler(head).x).toBeLessThan(0);
  });

  it('only poses torso mixer bones and leaves unmapped limbs untouched', () => {
    const { bones, rest } = createMixerRig();
    expect(PLAYER_CHARACTER_MIXER_BONES).toContain(PLAYER_CHARACTER_BONE.hips);
    expect(PLAYER_CHARACTER_MIXER_BONES).toContain(PLAYER_CHARACTER_BONE.spine);
    expect(PLAYER_CHARACTER_MIXER_BONES).not.toContain(PLAYER_CHARACTER_BONE.upperLegLeft);
    const weights = createWalkWeights();
    playerCharacterApplyBaseLocomotionPose(bones as never, rest as never, {
      planarSpeed: 2,
      verticalVelocity: 0,
      cyclePhaseRadians: Math.PI * 0.5,
      weights,
    });
    expect(bones.has(PLAYER_CHARACTER_BONE.upperLegLeft)).toBe(false);
  });

  it('leaves torso at rest for air so jump silhouette comes from limb IK', () => {
    const { bones, rest } = createMixerRig();
    const weights = playerCharacterCreatePoseWeights();
    weights.idle = 0;
    weights.walk = 0;
    weights.run = 0;
    weights.air = 1;
    const hips = bones.get(PLAYER_CHARACTER_BONE.hips)!;
    const spine = bones.get(PLAYER_CHARACTER_BONE.spine)!;
    const head = bones.get(PLAYER_CHARACTER_BONE.head)!;
    const restHips = rest.get(PLAYER_CHARACTER_BONE.hips)!;
    playerCharacterApplyBaseLocomotionPose(bones as never, rest as never, {
      planarSpeed: 0,
      verticalVelocity: 4,
      cyclePhaseRadians: 0,
      weights,
    });
    expect(hips.quaternion.angleTo(restHips)).toBeLessThan(1e-4);
    expect(Math.abs(readBoneEuler(spine).x)).toBeLessThan(1e-4);
    expect(Math.abs(readBoneEuler(head).x)).toBeLessThan(1e-4);
  });
});
