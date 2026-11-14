import type { PlayerToyArmPose } from './player_toy_viewmodel_arm.js';

/** A pose of the throw at a time in seconds after the click. */
interface PlayerToyPoseKey {
  readonly at: number;
  readonly pose: PlayerToyArmPose;
}

/** Holding the toy low in the lower right, palm up and turned in a little. */
export const PLAYER_TOY_POSE_REST: PlayerToyArmPose = { pitch: -0.55, yaw: 0.06, elbow: 0.98, wrist: 0.1, roll: 0.95 };
/**
 * Seconds after the click when the hand is wound back; holding the button
 * pauses there.
 */
export const PLAYER_TOY_POSE_WINDUP = 0.12;
/** Seconds the button is held for a full charge. */
export const PLAYER_TOY_CHARGE_SECONDS = 1;
/** Throw speed factor at a full charge (a quick click throws at 1). */
export const PLAYER_TOY_CHARGE_POWER = 2;
/** Seconds after the click when a thrown toy leaves the hand. */
export const PLAYER_TOY_POSE_THROW_RELEASE = 0.2;
/** Seconds after the click when a soccer ball is let go. */
export const PLAYER_TOY_POSE_PLACE_RELEASE = 0.22;
/** Seconds after the click when the next toy is in the hand again. */
export const PLAYER_TOY_POSE_REFILL = 0.4;
/** Length of the whole throw or put-down in seconds. */
export const PLAYER_TOY_POSE_SECONDS = 0.62;

/** Wound back: the throw's wind-up pose. */
const PLAYER_TOY_POSE_WOUND: PlayerToyArmPose = { pitch: -0.48, yaw: 0.06, elbow: 1.5, wrist: -0.3, roll: 1.5 };
/** Fully drawn back after holding the button for a full charge. */
const PLAYER_TOY_POSE_DRAWN: PlayerToyArmPose = { pitch: -0.32, yaw: -0.12, elbow: 2.15, wrist: -0.55, roll: 1.7 };

/**
 * Throw: the hand winds back and up beside the head (the elbow bends, the upper
 * arm lifts a little), swings forward from the shoulder while the elbow opens,
 * lets go at full reach, follows through down and across, and comes back to
 * rest.
 */
const PLAYER_TOY_POSE_THROW: readonly PlayerToyPoseKey[] = [
  { at: 0, pose: PLAYER_TOY_POSE_REST },
  { at: PLAYER_TOY_POSE_WINDUP, pose: PLAYER_TOY_POSE_WOUND },
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
 * Returns how far a throw is charged after holding the button: nothing up to
 * the wind-up, then growing evenly to full at the charge time.
 *
 * @param held Seconds the button was held.
 * @returns Charge from 0 to 1.
 */
export function playerToyCharge(held: number): number {
  const s = (held - PLAYER_TOY_POSE_WINDUP) / (PLAYER_TOY_CHARGE_SECONDS - PLAYER_TOY_POSE_WINDUP);
  return Math.min(1, Math.max(0, s));
}

/**
 * Returns the throw speed factor of a charge.
 *
 * @param charge Charge from 0 to 1.
 * @returns Factor from 1 to the full-charge power.
 */
export function playerToyChargePower(charge: number): number {
  return 1 + (PLAYER_TOY_CHARGE_POWER - 1) * charge;
}

/**
 * Returns the arm pose at a time of a throw or put-down: eased (smoothstep)
 * between key poses, the rest pose outside the animation. A charged throw winds
 * back further and swings forward from there.
 *
 * @param t Seconds since the click (negative or past the end: rest).
 * @param down True for the put-down.
 * @param charge Charge of the throw from 0 to 1.
 * @returns Pose.
 */
export function playerToyPoseAt(t: number, down: boolean, charge = 0): PlayerToyArmPose {
  const keys = down ? PLAYER_TOY_POSE_PLACE : playerToyPoseThrowKeys(charge);
  if (!(t > 0) || t >= PLAYER_TOY_POSE_SECONDS) return { ...PLAYER_TOY_POSE_REST };
  const index = keys.findIndex((key) => key.at > t);
  const from = keys[index - 1] as PlayerToyPoseKey;
  const to = keys[index] as PlayerToyPoseKey;
  const s = (t - from.at) / (to.at - from.at);
  return playerToyPoseMix(from.pose, to.pose, s * s * (3 - 2 * s));
}

/**
 * Returns the throw keys with the wind-up drawn back by a charge.
 *
 * @param charge Charge from 0 to 1.
 * @returns Keys.
 */
function playerToyPoseThrowKeys(charge: number): readonly PlayerToyPoseKey[] {
  if (!(charge > 0)) return PLAYER_TOY_POSE_THROW;
  const s = Math.min(1, charge);
  const wound = playerToyPoseMix(PLAYER_TOY_POSE_WOUND, PLAYER_TOY_POSE_DRAWN, s * s * (3 - 2 * s));
  return PLAYER_TOY_POSE_THROW.map((key) => (key.at === PLAYER_TOY_POSE_WINDUP ? { at: key.at, pose: wound } : key));
}

/**
 * Blends two poses.
 *
 * @param a Pose at 0.
 * @param b Pose at 1.
 * @param s Blend.
 * @returns Pose.
 */
function playerToyPoseMix(a: PlayerToyArmPose, b: PlayerToyArmPose, s: number): PlayerToyArmPose {
  const mix = (x: number, y: number): number => x + (y - x) * s;
  return {
    pitch: mix(a.pitch, b.pitch),
    yaw: mix(a.yaw, b.yaw),
    elbow: mix(a.elbow, b.elbow),
    wrist: mix(a.wrist, b.wrist),
    roll: mix(a.roll, b.roll),
  };
}
