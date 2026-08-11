/**
 * Minimal spacing for snap feedback. Frame events already collapse multi-step
 * snaps within a frame; this only blocks pathological back-to-back plays in the
 * same few milliseconds (e.g. double endFrame).
 */
export class AudioFeedbackRateLimiter {
  private lastWhooshPlayMs: number;
  private lastClickPlayMs: number;
  private lastFootstepPlayMs: number;
  private readonly whooshMinIntervalMs: number;
  private readonly clickMinIntervalMs: number;
  private readonly footstepMinIntervalMs: number;
  private readonly nowMs: () => number;

  /**
   * Creates a rate limiter for move snaps, scale snaps, and footsteps.
   *
   * @param whooshMinIntervalMs Minimum ms between move snaps (default ~60/s).
   * @param clickMinIntervalMs Minimum ms between scale snaps (default ~60/s).
   * @param nowMs Clock used for intervals (injectable for tests).
   * @param footstepMinIntervalMs Minimum ms between foot plants (default
   *   ~12/s).
   */
  constructor(
    whooshMinIntervalMs = 12,
    clickMinIntervalMs = 12,
    nowMs: () => number = () => performance.now(),
    footstepMinIntervalMs = 80,
  ) {
    this.lastWhooshPlayMs = Number.NEGATIVE_INFINITY;
    this.lastClickPlayMs = Number.NEGATIVE_INFINITY;
    this.lastFootstepPlayMs = Number.NEGATIVE_INFINITY;
    this.whooshMinIntervalMs = whooshMinIntervalMs;
    this.clickMinIntervalMs = clickMinIntervalMs;
    this.footstepMinIntervalMs = footstepMinIntervalMs;
    this.nowMs = nowMs;
  }

  /**
   * Returns whether a move snap may play now and records the play time.
   *
   * @returns True when enough time has passed since the last move snap.
   */
  tryConsumeWhoosh(): boolean {
    const timeMs = this.nowMs();
    if (timeMs - this.lastWhooshPlayMs < this.whooshMinIntervalMs) {
      return false;
    }
    this.lastWhooshPlayMs = timeMs;
    return true;
  }

  /**
   * Returns whether a scale snap may play now and records the play time.
   *
   * @returns True when enough time has passed since the last scale snap.
   */
  tryConsumeClick(): boolean {
    const timeMs = this.nowMs();
    if (timeMs - this.lastClickPlayMs < this.clickMinIntervalMs) {
      return false;
    }
    this.lastClickPlayMs = timeMs;
    return true;
  }

  /**
   * Returns whether a footstep may play now and records the play time.
   *
   * @returns True when enough time has passed since the last footstep.
   */
  tryConsumeFootstep(): boolean {
    const timeMs = this.nowMs();
    if (timeMs - this.lastFootstepPlayMs < this.footstepMinIntervalMs) {
      return false;
    }
    this.lastFootstepPlayMs = timeMs;
    return true;
  }

  /** Clears play timestamps (tests / dispose). */
  reset(): void {
    this.lastWhooshPlayMs = Number.NEGATIVE_INFINITY;
    this.lastClickPlayMs = Number.NEGATIVE_INFINITY;
    this.lastFootstepPlayMs = Number.NEGATIVE_INFINITY;
  }
}

/** Shared snap-feedback rate limiter for editor audio. */
export const audioFeedbackRateLimiter = new AudioFeedbackRateLimiter();
