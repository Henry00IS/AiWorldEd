import type { PlayerToyArmPose } from './player_toy_viewmodel_arm.js';

/** A pose of the throw at a time in seconds after the click. */
interface PlayerToyPoseKey {
  readonly at: number;
  readonly pose: PlayerToyArmPose;
}

/** Holding the toy low in the lower right, palm up and turned in a little. */
export const PLAYER_TOY_POSE_REST: PlayerToyArmPose = { pitch: -0.55, yaw: 0.06, elbow: 0.98, wrist: 0.1, roll: 0.95 };
/** Seconds after the click when a thrown toy leaves the hand. */
export const PLAYER_TOY_POSE_THROW_RELEASE = 0.2;
/** Seconds after the click when a soccer ball is let go. */
export const PLAYER_TOY_POSE_PLACE_RELEASE = 0.22;
/** Seconds after the click when the next toy is in the hand again. */
export const PLAYER_TOY_POSE_REFILL = 0.4;
/** Length of the whole throw or put-down in seconds. */
export const PLAYER_TOY_POSE_SECONDS = 0.62;

/**
 * Throw: the hand winds back and up beside the head (the elbow bends, the upper
 * arm lifts a little), swings forward from the shoulder while the elbow opens,
 * lets go at full reach, follows through down and across, and comes back to
 * rest.
 */
const PLAYER_TOY_POSE_THROW: readonly PlayerToyPoseKey[] = [
  { at: 0, pose: PLAYER_TOY_POSE_REST },
  { at: 0.12, pose: { pitch: -0.48, yaw: 0.06, elbow: 1.5, wrist: -0.3, roll: 1.5 } },
  { at: PLAYER_TOY_POSE_THROW_RELEASE, pose: { pitch: -0.18, yaw: 0.24, elbow: 0.38, wrist: 0.1, roll: 0.6 } },
  { at: 0.34, pose: { pitch: -1.05, yaw: 0.44, elbow: 0.62, wrist: -0.32, roll: 0.8 } },
  { at: PLAYER_TOY_POSE_SECONDS, pose: PLAYER_TOY_POSE_REST },
];

/** Put-down: the arm reaches forward and down, lets go low and comes back. */
const PLAYER_TOY_POSE_PLACE: readonly PlayerToyPoseKey[] = [
  { at: 0, pose: PLAYER_TOY_POSE_REST },
  { at: 0.12, pose: { pitch: -0.75, yaw: 0.2, elbow: 0.75, wrist: -0.1, roll: 0.9 } },
  { at: PLAYER_TOY_POSE_PLACE_RELEASE, pose: { pitch: -0.95, yaw: 0.24, elbow: 0.55, wrist: -0.35, roll: 0.85 } },
  { at: PLAYER_TOY_POSE_SECONDS, pose: PLAYER_TOY_POSE_REST },
];

/**
 * Returns the arm pose at a time of a throw or put-down: eased (smoothstep)
 * between key poses, the rest pose outside the animation.
 *
 * @param t Seconds since the click (negative or past the end: rest).
 * @param down True for the put-down.
 * @returns Pose.
 */
export function playerToyPoseAt(t: number, down: boolean): PlayerToyArmPose {
  const keys = down ? PLAYER_TOY_POSE_PLACE : PLAYER_TOY_POSE_THROW;
  if (!(t > 0) || t >= PLAYER_TOY_POSE_SECONDS) return { ...PLAYER_TOY_POSE_REST };
  const index = keys.findIndex((key) => key.at > t);
  const from = keys[index - 1] as PlayerToyPoseKey;
  const to = keys[index] as PlayerToyPoseKey;
  const s = (t - from.at) / (to.at - from.at);
  const eased = s * s * (3 - 2 * s);
  const mix = (a: number, b: number): number => a + (b - a) * eased;
  const { pitch, yaw, elbow, wrist, roll } = from.pose;
  return {
    pitch: mix(pitch, to.pose.pitch),
    yaw: mix(yaw, to.pose.yaw),
    elbow: mix(elbow, to.pose.elbow),
    wrist: mix(wrist, to.pose.wrist),
    roll: mix(roll, to.pose.roll),
  };
}
