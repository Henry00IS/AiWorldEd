import * as THREE from 'three';
import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from './player_character_bone_ids.js';
import type { PlayerCharacterPoseWeights } from './player_character_pose_weights.js';

/** Inputs that drive procedural locomotion pose sampling. */
export interface PlayerCharacterLocomotionPoseInput {
  planarSpeed: number;
  verticalVelocity: number;
  cyclePhaseRadians: number;
  weights: PlayerCharacterPoseWeights;
}

/** Euler delta triple. */
interface EulerDelta {
  x: number;
  y: number;
  z: number;
}

const ZERO_EULER: EulerDelta = { x: 0, y: 0, z: 0 };

/**
 * Bones written by the torso mixer. Limbs stay at rest so control IK owns feet
 * and hands.
 */
export const PLAYER_CHARACTER_MIXER_BONES: readonly PlayerCharacterBoneId[] = [
  PLAYER_CHARACTER_BONE.hips,
  PLAYER_CHARACTER_BONE.spine,
  PLAYER_CHARACTER_BONE.head,
];

const WALK_HIP_YAW_RADIANS = 0.08;
const RUN_HIP_YAW_RADIANS = 0.12;
/**
 * Run torso pitch from reference/character-run.glb (LowerSpine ~44°, UpperSpine
 * ~25°). Softened slightly from the full sample for readability in play mode.
 */
const RUN_HIP_PITCH_RADIANS = 0.55;
const RUN_SPINE_PITCH_RADIANS = 0.38;
/** Head counters the stacked torso lean so the gaze stays near the horizon. */
const RUN_HEAD_PITCH_COUNTER_FRACTION = 0.62;
const SPINE_HIP_YAW_COUNTER_FRACTION = 0.4;

const scratchEuler = new THREE.Euler();
const scratchQuatB = new THREE.Quaternion();
const scratchQuatOut = new THREE.Quaternion();

/**
 * Applies exclusive torso locomotion from rest for hips, spine, and head.
 *
 * @param bones Character bone map.
 * @param restLocalQuaternions Rest-pose local quaternions captured at rig
 *   build.
 * @param input Locomotion pose drivers and blend weights.
 */
export function playerCharacterApplyBaseLocomotionPose(
  bones: Map<PlayerCharacterBoneId, THREE.Bone>,
  restLocalQuaternions: Map<PlayerCharacterBoneId, THREE.Quaternion>,
  input: PlayerCharacterLocomotionPoseInput,
): void {
  for (let index = 0; index < PLAYER_CHARACTER_MIXER_BONES.length; index++) {
    const boneId = PLAYER_CHARACTER_MIXER_BONES[index];
    if (!boneId) {
      continue;
    }
    applyBaseMixedBone(bones, restLocalQuaternions, boneId, input);
  }
}

/**
 * Mixes one bone from rest using weighted clip quaternions.
 *
 * @param bones Bone map.
 * @param restLocalQuaternions Rest locals.
 * @param boneId Bone to pose.
 * @param input Locomotion drivers.
 */
function applyBaseMixedBone(
  bones: Map<PlayerCharacterBoneId, THREE.Bone>,
  restLocalQuaternions: Map<PlayerCharacterBoneId, THREE.Quaternion>,
  boneId: PlayerCharacterBoneId,
  input: PlayerCharacterLocomotionPoseInput,
): void {
  const bone = bones.get(boneId);
  const rest = restLocalQuaternions.get(boneId);
  if (!bone || !rest) {
    return;
  }
  scratchQuatOut.copy(rest);
  mixAllClipsIntoScratch(rest, boneId, input);
  bone.quaternion.copy(scratchQuatOut);
}

/**
 * Writes the exclusive torso clip for the one-hot pose state into scratch.
 *
 * @param rest Rest local quaternion.
 * @param boneId Bone being posed.
 * @param input Locomotion drivers.
 */
function mixAllClipsIntoScratch(
  rest: THREE.Quaternion,
  boneId: PlayerCharacterBoneId,
  input: PlayerCharacterLocomotionPoseInput,
): void {
  const phase = input.cyclePhaseRadians;
  const weights = input.weights;
  if (weights.air > 0.5) {
    writeRestPlusEuler(rest, ZERO_EULER, scratchQuatOut);
    return;
  }
  if (weights.run > 0.5) {
    writeRestPlusEuler(rest, sampleRunEuler(boneId, phase), scratchQuatOut);
    return;
  }
  if (weights.walk > 0.5) {
    writeRestPlusEuler(rest, sampleWalkEuler(boneId, phase), scratchQuatOut);
    return;
  }
  writeRestPlusEuler(rest, sampleIdleEuler(boneId, phase), scratchQuatOut);
}

/**
 * Builds rest orientation plus local euler deltas into a quaternion.
 *
 * @param rest Rest local quaternion.
 * @param euler Euler deltas.
 * @param target Destination quaternion.
 */
function writeRestPlusEuler(rest: THREE.Quaternion, euler: EulerDelta, target: THREE.Quaternion): void {
  target.copy(rest);
  if (euler.x === 0 && euler.y === 0 && euler.z === 0) {
    return;
  }
  scratchEuler.set(euler.x, euler.y, euler.z, 'XYZ');
  scratchQuatB.setFromEuler(scratchEuler);
  target.multiply(scratchQuatB);
}

/**
 * Samples idle breathing deltas for one bone.
 *
 * @param boneId Bone id.
 * @param phase Cycle phase.
 * @returns Euler delta.
 */
function sampleIdleEuler(boneId: PlayerCharacterBoneId, phase: number): EulerDelta {
  if (boneId !== PLAYER_CHARACTER_BONE.spine) {
    return ZERO_EULER;
  }
  return { x: Math.sin(phase * 0.5) * 0.015, y: 0, z: 0 };
}

/**
 * Samples walk torso deltas. Limbs stay at rest for IK.
 *
 * @param boneId Bone id.
 * @param phase Cycle phase.
 * @returns Euler delta.
 */
function sampleWalkEuler(boneId: PlayerCharacterBoneId, phase: number): EulerDelta {
  const hipYaw = Math.cos(phase) * WALK_HIP_YAW_RADIANS;
  if (boneId === PLAYER_CHARACTER_BONE.hips) {
    return { x: 0.03, y: hipYaw, z: Math.sin(phase) * 0.03 };
  }
  if (boneId === PLAYER_CHARACTER_BONE.spine) {
    return { x: 0.05, y: -hipYaw * SPINE_HIP_YAW_COUNTER_FRACTION, z: Math.sin(phase) * 0.03 };
  }
  return ZERO_EULER;
}

/**
 * Samples run torso lean with forward pitch and pelvic yaw.
 *
 * @param boneId Bone id.
 * @param phase Cycle phase.
 * @returns Euler delta.
 */
function sampleRunEuler(boneId: PlayerCharacterBoneId, phase: number): EulerDelta {
  const bob = Math.sin(phase * 2) * 0.025;
  const hipYaw = Math.cos(phase) * RUN_HIP_YAW_RADIANS;
  if (boneId === PLAYER_CHARACTER_BONE.hips) {
    return { x: RUN_HIP_PITCH_RADIANS + bob, y: hipYaw, z: Math.sin(phase) * 0.03 };
  }
  if (boneId === PLAYER_CHARACTER_BONE.spine) {
    return { x: RUN_SPINE_PITCH_RADIANS, y: -hipYaw * SPINE_HIP_YAW_COUNTER_FRACTION, z: Math.sin(phase) * 0.04 };
  }
  if (boneId === PLAYER_CHARACTER_BONE.head) {
    return {
      x: -(RUN_HIP_PITCH_RADIANS + RUN_SPINE_PITCH_RADIANS) * RUN_HEAD_PITCH_COUNTER_FRACTION,
      y: 0,
      z: 0,
    };
  }
  return ZERO_EULER;
}
