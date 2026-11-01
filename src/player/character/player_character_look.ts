import * as THREE from 'three';
import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from './player_character_bone_ids.js';
import type { PlayerCharacterRig } from './player_character_rig.js';

/** Degrees to radians. */
const DEGREES = Math.PI / 180;

/** One joint of the look chain: its share and its range in radians. */
export interface PlayerCharacterLookJoint {
  /** Joint name (the head and neck both drive the Head bone). */
  name: 'head' | 'neck' | 'chest' | 'back';
  /** Bone the joint rotates. */
  bone: PlayerCharacterBoneId;
  /** Share of the look pitch before clamping. */
  pitchShare: number;
  /** Lowest pitch (looking down, negative). */
  pitchDown: number;
  /** Highest pitch (looking up). */
  pitchUp: number;
  /** Largest yaw either way. */
  yawLimit: number;
}

/**
 * The look chain from the head down. Pitch splits head 45 %, neck 30 %, chest
 * 25 % (the rig has no neck bone, so head and neck both turn the Head bone);
 * whatever a joint cannot take because of its range moves on to the next one
 * down, ending with a slight bend of the lower back so a look straight up or
 * down still reads. Yaw fills the head and neck first (about 65 degrees
 * together) and only then turns the chest and back.
 */
export const PLAYER_CHARACTER_LOOK_CHAIN: readonly PlayerCharacterLookJoint[] = [
  {
    name: 'head',
    bone: PLAYER_CHARACTER_BONE.head,
    pitchShare: 0.45,
    pitchDown: -30 * DEGREES,
    pitchUp: 30 * DEGREES,
    yawLimit: 30 * DEGREES,
  },
  {
    name: 'neck',
    bone: PLAYER_CHARACTER_BONE.head,
    pitchShare: 0.3,
    pitchDown: -40 * DEGREES,
    pitchUp: 50 * DEGREES,
    yawLimit: 35 * DEGREES,
  },
  {
    name: 'chest',
    bone: PLAYER_CHARACTER_BONE.spine,
    pitchShare: 0.25,
    pitchDown: -30 * DEGREES,
    pitchUp: 30 * DEGREES,
    yawLimit: 30 * DEGREES,
  },
  {
    name: 'back',
    bone: PLAYER_CHARACTER_BONE.hips,
    pitchShare: 0,
    pitchDown: -20 * DEGREES,
    pitchUp: 20 * DEGREES,
    yawLimit: 20 * DEGREES,
  },
];

/** Largest pitch accepted (straight up or down). */
export const PLAYER_CHARACTER_LOOK_PITCH_LIMIT = Math.PI / 2;

/** Rotation of one joint. */
export interface PlayerCharacterLookAngles {
  /** Yaw in radians, positive turning left (toward +X from +Z). */
  yaw: number;
  /** Pitch in radians, positive looking up. */
  pitch: number;
}

/**
 * Splits a look direction relative to the body over the look chain. Garbage
 * input (NaN, infinities) counts as looking ahead; pitch is clamped to straight
 * up or down and yaw wrapped to a half turn either way.
 *
 * @param yaw Look yaw relative to the body facing, in radians.
 * @param pitch Look pitch in radians, positive up.
 * @returns One rotation per joint of PLAYER_CHARACTER_LOOK_CHAIN, in order.
 */
export function playerCharacterLookDistribute(yaw: number, pitch: number): PlayerCharacterLookAngles[] {
  const wantedYaw = playerCharacterLookWrap(Number.isFinite(yaw) ? yaw : 0);
  const wantedPitch = THREE.MathUtils.clamp(
    Number.isFinite(pitch) ? pitch : 0,
    -PLAYER_CHARACTER_LOOK_PITCH_LIMIT,
    PLAYER_CHARACTER_LOOK_PITCH_LIMIT,
  );
  let yawLeft = wantedYaw;
  let pitchCarry = 0;
  return PLAYER_CHARACTER_LOOK_CHAIN.map((joint) => {
    const jointYaw = THREE.MathUtils.clamp(yawLeft, -joint.yawLimit, joint.yawLimit);
    yawLeft -= jointYaw;
    const wanted = wantedPitch * joint.pitchShare + pitchCarry;
    const jointPitch = THREE.MathUtils.clamp(wanted, joint.pitchDown, joint.pitchUp);
    pitchCarry = wanted - jointPitch;
    return { yaw: jointYaw, pitch: jointPitch };
  });
}

/**
 * Wraps an angle into [-PI, PI].
 *
 * @param angle Angle in radians.
 * @returns Wrapped angle.
 */
function playerCharacterLookWrap(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

const lookCurrent = new THREE.Quaternion();
const lookPrevious = new THREE.Quaternion();
const lookDelta = new THREE.Quaternion();
const lookParent = new THREE.Quaternion();
const lookRoot = new THREE.Quaternion();
const lookEuler = new THREE.Euler();

/**
 * Turns the rig's head, chest and back on top of the current pose so the
 * character looks in a direction. Each joint adds its share in the character's
 * own frame, from the back up, so the head ends up facing the full (clamped)
 * look direction. Looking up (positive pitch) is a negative turn about +X,
 * which tilts the +Z facing toward +Y. World matrices must be current; they are
 * refreshed on the way.
 *
 * @param rig Character rig (root faces +Z, like the player body facing).
 * @param angles Joint rotations from playerCharacterLookDistribute.
 */
export function playerCharacterLookApply(rig: PlayerCharacterRig, angles: readonly PlayerCharacterLookAngles[]): void {
  let yaw = 0;
  let pitch = 0;
  lookPrevious.identity();
  rig.root.getWorldQuaternion(lookRoot).invert();
  for (let index = PLAYER_CHARACTER_LOOK_CHAIN.length - 1; index >= 0; index--) {
    const joint = PLAYER_CHARACTER_LOOK_CHAIN[index];
    const angle = angles[index];
    const bone = joint === undefined ? undefined : rig.bones.get(joint.bone);
    if (angle === undefined || bone === undefined) continue;
    yaw += angle.yaw;
    pitch += angle.pitch;
    lookCurrent.setFromEuler(lookEuler.set(-pitch, yaw, 0, 'YXZ'));
    lookDelta.copy(lookPrevious).invert().premultiply(lookCurrent);
    lookPrevious.copy(lookCurrent);
    if (bone.parent === null) continue;
    bone.parent.getWorldQuaternion(lookParent).premultiply(lookRoot);
    lookDelta.premultiply(lookParent.clone().invert()).multiply(lookParent);
    bone.quaternion.premultiply(lookDelta);
    bone.updateMatrixWorld(true);
  }
}
