import * as THREE from 'three';

/**
 * Seconds the fastest recent player velocity counts in full after it was
 * reached.
 */
export const PLAYER_BALL_CARRY_HOLD_SECONDS = 0.18;
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
