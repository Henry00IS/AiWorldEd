/** Kind of a remote character sound. */
export type SoundCollaborationPresenceKind = 'step' | 'jump' | 'land';

/** Receives a remote character sound at a world position. */
export type SoundCollaborationPresenceSink = (
  kind: SoundCollaborationPresenceKind,
  x: number,
  y: number,
  z: number,
  strength: number,
) => void;

/** Shortest airborne time that lands audibly (shorter is a step over a ledge). */
export const SOUND_COLLABORATION_PRESENCE_AIR_MS = 120;
/** Shortest time between two jump or two landing sounds. */
export const SOUND_COLLABORATION_PRESENCE_REPEAT_MS = 250;
/** Silence after a teleport (spawn, respawn, rejoin). */
export const SOUND_COLLABORATION_PRESENCE_TELEPORT_MS = 400;
/** Rise after leaving the ground that counts as a jump (not a fall). */
export const SOUND_COLLABORATION_PRESENCE_JUMP_RISE = 0.12;
/** Time after leaving the ground within which the rise must happen. */
export const SOUND_COLLABORATION_PRESENCE_JUMP_WINDOW_MS = 300;

/**
 * Jump and landing sounds of a remote character, derived from its ground flag
 * and smoothed height (nothing extra goes over the network). A takeoff counts
 * as a jump only once the body rises (walking off a ledge stays silent); a
 * landing needs a real airborne time; repeats within a short time and anything
 * right after a teleport are dropped. Footsteps pass through unchanged (the
 * animation raises them from its foot contacts).
 */
export class SoundCollaborationPresence {
  private readonly sink: SoundCollaborationPresenceSink;
  private grounded: boolean | null;
  private airborneSince: number;
  private takeoffHeight: number;
  private jumpPending: boolean;
  private fallSpeed: number;
  private lastJump: number;
  private lastLand: number;
  private quietUntil: number;

  /**
   * Creates the sound state.
   *
   * @param sink Receives the sounds.
   */
  constructor(sink: SoundCollaborationPresenceSink) {
    this.sink = sink;
    this.grounded = null;
    this.airborneSince = 0;
    this.takeoffHeight = 0;
    this.jumpPending = false;
    this.fallSpeed = 0;
    this.lastJump = Number.NEGATIVE_INFINITY;
    this.lastLand = Number.NEGATIVE_INFINITY;
    this.quietUntil = Number.NEGATIVE_INFINITY;
  }

  /**
   * Silences jumps and landings for a moment and forgets the ground state.
   *
   * @param now Current time in milliseconds.
   */
  teleport(now: number): void {
    this.grounded = null;
    this.jumpPending = false;
    this.quietUntil = now + SOUND_COLLABORATION_PRESENCE_TELEPORT_MS;
  }

  /**
   * Passes a planted foot on.
   *
   * @param x World X.
   * @param y World Y.
   * @param z World Z.
   * @param planarSpeed Planar speed in meters per second.
   * @param now Current time in milliseconds.
   */
  step(x: number, y: number, z: number, planarSpeed: number, now: number): void {
    if (now < this.quietUntil) return;
    this.sink('step', x, y, z, planarSpeed);
  }

  /**
   * Advances with the shown ground state and feet.
   *
   * @param now Current time in milliseconds.
   * @param grounded Shown ground flag.
   * @param x Feet X.
   * @param y Feet Y.
   * @param z Feet Z.
   * @param verticalVelocity Smoothed vertical velocity.
   */
  update(now: number, grounded: boolean, x: number, y: number, z: number, verticalVelocity: number): void {
    const was = this.grounded;
    this.grounded = grounded;
    if (was === null) return;
    if (!grounded) this.fallSpeed = Math.max(this.fallSpeed, -verticalVelocity);
    if (was && !grounded) this.takeoff(now, y);
    if (!was && grounded) this.landing(now, x, y, z);
    if (this.jumpPending) this.jumpCheck(now, x, y, z);
  }

  /**
   * Starts watching for a jump.
   *
   * @param now Current time in milliseconds.
   * @param y Feet height.
   */
  private takeoff(now: number, y: number): void {
    this.airborneSince = now;
    this.takeoffHeight = y;
    this.jumpPending = true;
    this.fallSpeed = 0;
  }

  /**
   * Plays the jump once the body rose enough soon after leaving the ground.
   *
   * @param now Current time in milliseconds.
   * @param x Feet X.
   * @param y Feet Y.
   * @param z Feet Z.
   */
  private jumpCheck(now: number, x: number, y: number, z: number): void {
    if (now - this.airborneSince > SOUND_COLLABORATION_PRESENCE_JUMP_WINDOW_MS) {
      this.jumpPending = false;
      return;
    }
    if (y - this.takeoffHeight < SOUND_COLLABORATION_PRESENCE_JUMP_RISE) return;
    this.jumpPending = false;
    if (now < this.quietUntil || now - this.lastJump < SOUND_COLLABORATION_PRESENCE_REPEAT_MS) return;
    this.lastJump = now;
    this.sink('jump', x, this.takeoffHeight, z, 1);
  }

  /**
   * Plays the landing after a real airborne time.
   *
   * @param now Current time in milliseconds.
   * @param x Feet X.
   * @param y Feet Y.
   * @param z Feet Z.
   */
  private landing(now: number, x: number, y: number, z: number): void {
    this.jumpPending = false;
    if (now - this.airborneSince < SOUND_COLLABORATION_PRESENCE_AIR_MS) return;
    if (now < this.quietUntil || now - this.lastLand < SOUND_COLLABORATION_PRESENCE_REPEAT_MS) return;
    this.lastLand = now;
    this.sink('land', x, y, z, this.fallSpeed);
  }
}
