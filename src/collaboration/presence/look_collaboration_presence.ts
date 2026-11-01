import * as THREE from 'three';
import {
  PRESENCE_CHARACTER_FLAG_GROUNDED,
  PRESENCE_CHARACTER_FLAG_RUN,
  PRESENCE_CHARACTER_FLAG_WALL_PUSH,
  PRESENCE_CHARACTER_FLAGS_MASK,
} from '@/collaboration/shared/presence_frame.js';

/**
 * Factor the look yaw is divided by before it becomes the middle angle of the
 * orientation, keeping that angle within 45 degrees (far from the gimbal lock
 * at 90).
 */
const LOOK_COLLABORATION_PRESENCE_YAW_SCALE = 4;
/** Largest pitch carried (straight up or down). */
const LOOK_COLLABORATION_PRESENCE_PITCH_LIMIT = Math.PI / 2;

/** Body facing and look direction of a play-mode character. */
export interface LookCollaborationPresence {
  /** Body facing yaw in radians around +Y. */
  bodyYaw: number;
  /** Look yaw relative to the body facing, in radians (-PI..PI). */
  yaw: number;
  /** Look pitch in radians, positive up. */
  pitch: number;
}

/** Motion state of a play-mode character. */
export interface MotionCollaborationPresence {
  /** Standing on the ground. */
  grounded: boolean;
  /** Pushing against a wall. */
  wallPushing: boolean;
  /** Running. */
  running: boolean;
}

const lookEuler = new THREE.Euler();

/**
 * Packs the body facing and the look into the character entry's orientation:
 * Euler YXZ with the body yaw around Y, a quarter of the relative look yaw
 * around X and the look pitch around Z. Every angle stays recoverable within
 * the quaternion packing's resolution (about 0.1 degree; 0.4 for the look yaw),
 * and the presence interpolation slerps it smoothly. Non-finite input counts as
 * zero.
 *
 * @param bodyYaw Body facing yaw in radians.
 * @param lookYaw Absolute look yaw in radians.
 * @param pitch Look pitch in radians, positive up.
 * @param target Destination quaternion.
 * @returns The target quaternion.
 */
export function lookCollaborationPresenceEncode(
  bodyYaw: number,
  lookYaw: number,
  pitch: number,
  target: THREE.Quaternion,
): THREE.Quaternion {
  const body = lookCollaborationPresenceFinite(bodyYaw);
  const relative = lookCollaborationPresenceWrap(lookCollaborationPresenceFinite(lookYaw) - body);
  const clamped = THREE.MathUtils.clamp(
    lookCollaborationPresenceFinite(pitch),
    -LOOK_COLLABORATION_PRESENCE_PITCH_LIMIT,
    LOOK_COLLABORATION_PRESENCE_PITCH_LIMIT,
  );
  return target.setFromEuler(lookEuler.set(relative / LOOK_COLLABORATION_PRESENCE_YAW_SCALE, body, clamped, 'YXZ'));
}

/**
 * Reads the body facing and look back from an orientation packed by
 * lookCollaborationPresenceEncode. Any unit quaternion decodes to finite
 * angles.
 *
 * @param quaternion Orientation.
 * @returns Body yaw, relative look yaw and pitch.
 */
export function lookCollaborationPresenceDecode(quaternion: THREE.Quaternion): LookCollaborationPresence {
  lookEuler.setFromQuaternion(quaternion, 'YXZ');
  return {
    bodyYaw: lookCollaborationPresenceFinite(lookEuler.y),
    yaw: lookCollaborationPresenceWrap(
      lookCollaborationPresenceFinite(lookEuler.x) * LOOK_COLLABORATION_PRESENCE_YAW_SCALE,
    ),
    pitch: THREE.MathUtils.clamp(
      lookCollaborationPresenceFinite(lookEuler.z),
      -LOOK_COLLABORATION_PRESENCE_PITCH_LIMIT,
      LOOK_COLLABORATION_PRESENCE_PITCH_LIMIT,
    ),
  };
}

/**
 * Packs the motion state into the character entry's flag byte.
 *
 * @param motion Motion state.
 * @returns Flag byte.
 */
export function lookCollaborationPresenceFlags(motion: MotionCollaborationPresence): number {
  return (
    (motion.grounded ? PRESENCE_CHARACTER_FLAG_GROUNDED : 0) |
    (motion.wallPushing ? PRESENCE_CHARACTER_FLAG_WALL_PUSH : 0) |
    (motion.running ? PRESENCE_CHARACTER_FLAG_RUN : 0)
  );
}

/**
 * Reads the motion state from a character entry's flag byte (unknown bits are
 * ignored).
 *
 * @param flags Flag byte.
 * @returns Motion state.
 */
export function lookCollaborationPresenceMotion(flags: number): MotionCollaborationPresence {
  const known = flags & PRESENCE_CHARACTER_FLAGS_MASK;
  return {
    grounded: (known & PRESENCE_CHARACTER_FLAG_GROUNDED) !== 0,
    wallPushing: (known & PRESENCE_CHARACTER_FLAG_WALL_PUSH) !== 0,
    running: (known & PRESENCE_CHARACTER_FLAG_RUN) !== 0,
  };
}

/**
 * Wraps an angle into [-PI, PI].
 *
 * @param angle Angle in radians.
 * @returns Wrapped angle.
 */
export function lookCollaborationPresenceWrap(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

/**
 * Replaces non-finite numbers by zero.
 *
 * @param value Number.
 * @returns Finite number.
 */
function lookCollaborationPresenceFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
