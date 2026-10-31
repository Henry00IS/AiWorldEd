import type { PresenceEntry } from '@/collaboration/shared/presence_frame.js';

/** Sampling period of the local presence. */
export const THROTTLE_COLLABORATION_PRESENCE_SAMPLE_MS = 100;
/** Shortest gap between two presence frames (at most 5 per second). */
export const THROTTLE_COLLABORATION_PRESENCE_INTERVAL_MS = 200;
/** Movement below this many meters is not worth a frame. */
export const THROTTLE_COLLABORATION_PRESENCE_POSITION_EPSILON = 0.01;
/** Rotation below this many degrees is not worth a frame. */
export const THROTTLE_COLLABORATION_PRESENCE_ANGLE_EPSILON = 0.5;

/**
 * Decides when the local presence goes out: only after a visible change, at
 * most every interval, and always once more after the motion stops so the final
 * pose arrives (the comparison is against the last frame sent).
 */
export class ThrottleCollaborationPresence {
  private sent: readonly PresenceEntry[] | null;
  private sentAt: number;

  /** Creates a throttle that has sent nothing yet. */
  constructor() {
    this.sent = null;
    this.sentAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Returns true when the sample should be sent now.
   *
   * @param entries Current sample.
   * @param now Current time in milliseconds.
   * @returns True when due.
   */
  due(entries: readonly PresenceEntry[], now: number): boolean {
    if (now - this.sentAt < THROTTLE_COLLABORATION_PRESENCE_INTERVAL_MS) return false;
    return this.sent === null || !presenceCollaborationEntriesClose(this.sent, entries);
  }

  /**
   * Records a frame that went out.
   *
   * @param entries Sent entries.
   * @param now Send time in milliseconds.
   */
  mark(entries: readonly PresenceEntry[], now: number): void {
    this.sent = entries;
    this.sentAt = now;
  }

  /** Forgets the last frame, so the next sample is sent again. */
  reset(): void {
    this.sent = null;
    this.sentAt = Number.NEGATIVE_INFINITY;
  }
}

/**
 * Compares two samples within the deadband.
 *
 * @param a First sample.
 * @param b Second sample.
 * @returns True when no entry changed visibly.
 */
export function presenceCollaborationEntriesClose(a: readonly PresenceEntry[], b: readonly PresenceEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return other !== undefined && presenceCollaborationEntryClose(entry, other);
  });
}

/**
 * Compares two entries within the deadband.
 *
 * @param a First entry.
 * @param b Second entry.
 * @returns True when equal enough.
 */
function presenceCollaborationEntryClose(a: PresenceEntry, b: PresenceEntry): boolean {
  if (a.id !== b.id || a.fov !== b.fov) return false;
  const distance = Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );
  if (distance > THROTTLE_COLLABORATION_PRESENCE_POSITION_EPSILON) return false;
  return presenceCollaborationAngle(a.quaternion, b.quaternion) <= THROTTLE_COLLABORATION_PRESENCE_ANGLE_EPSILON;
}

/**
 * Returns the rotation between two unit quaternions.
 *
 * @param a First quaternion.
 * @param b Second quaternion.
 * @returns Angle in degrees.
 */
export function presenceCollaborationAngle(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}
