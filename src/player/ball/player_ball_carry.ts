import * as THREE from 'three';

const scratchAim = new THREE.Vector3();

/**
 * Seconds the fastest recent player velocity counts in full after it was
 * reached (read when the button goes down or up, so letting go up to 0.2 s
 * after stopping still throws at full run).
 */
export const PLAYER_BALL_CARRY_HOLD_SECONDS = 0.2;
/** Seconds after it was reached when it no longer counts at all. */
export const PLAYER_BALL_CARRY_FADE_SECONDS = 0.35;

/**
 * Remembers the fastest recent player velocity a throw carries: a player who
 * runs, stops and throws right after still throws hard. The peak counts in full
 * for a moment, then fades out, unless a faster velocity replaces it.
 */
export class PlayerBallCarry {
  private readonly peak: THREE.Vector3;
  private peakAt: number;

  /** Starts with nothing remembered. */
  constructor() {
    this.peak = new THREE.Vector3();
    this.peakAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Takes the player velocity of a frame; it becomes the peak when at least as
   * fast as what the peak still counts.
   *
   * @param velocity Player velocity.
   * @param now Time in seconds.
   */
  record(velocity: THREE.Vector3, now: number): void {
    if (velocity.lengthSq() < this.at(now, new THREE.Vector3()).lengthSq()) return;
    this.peak.copy(velocity);
    this.peakAt = now;
  }

  /**
   * Returns the velocity a throw carries now: the peak, faded by its age.
   *
   * @param now Time in seconds.
   * @param out Receives the velocity.
   * @returns The velocity.
   */
  at(now: number, out: THREE.Vector3): THREE.Vector3 {
    const fade =
      (now - this.peakAt - PLAYER_BALL_CARRY_HOLD_SECONDS) /
      (PLAYER_BALL_CARRY_FADE_SECONDS - PLAYER_BALL_CARRY_HOLD_SECONDS);
    return out.copy(this.peak).multiplyScalar(THREE.MathUtils.clamp(1 - fade, 0, 1));
  }

  /** Forgets the peak. */
  reset(): void {
    this.peak.set(0, 0, 0);
    this.peakAt = Number.NEGATIVE_INFINITY;
  }
}

/** Share of the sideways running speed a paper plane keeps. */
export const PLAYER_BALL_PLANE_CARRY_SIDEWAYS = 0.25;

/**
 * Narrows the running speed a paper plane inherits: all of it forward along the
 * aim, none backwards or up and down, and a little of it sideways, so it still
 * flies away from a player running backwards and keeps its heading.
 *
 * @param carry Running velocity, changed in place.
 * @param forward Aim direction.
 * @returns The carry.
 */
export function playerBallPlaneCarry(carry: THREE.Vector3, forward: THREE.Vector3): THREE.Vector3 {
  const aim = scratchAim.set(forward.x, 0, forward.z);
  if (aim.lengthSq() < 1e-8) return carry.set(0, 0, 0);
  aim.normalize();
  const along = carry.x * aim.x + carry.z * aim.z;
  carry.setY(0).addScaledVector(aim, -along).multiplyScalar(PLAYER_BALL_PLANE_CARRY_SIDEWAYS);
  return carry.addScaledVector(aim, Math.max(0, along));
}
