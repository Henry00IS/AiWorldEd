import { describe, expect, it } from 'vitest';
import {
  THROTTLE_COLLABORATION_PRESENCE_INTERVAL_MS,
  THROTTLE_COLLABORATION_PRESENCE_SLACK_MS,
  ThrottleCollaborationPresence,
  presenceCollaborationAngle,
  presenceCollaborationEntriesClose,
} from '@/collaboration/presence/throttle_collaboration_presence.js';
import type { PresenceEntry } from '@/collaboration/shared/presence_frame.js';

/**
 * Builds a camera entry.
 *
 * @param x X position.
 * @param yawDegrees Rotation around Y.
 * @param fov Field of view.
 * @returns Entry.
 */
function entry(x: number, yawDegrees: number = 0, fov: number = 50): PresenceEntry {
  const half = (yawDegrees * Math.PI) / 360;
  return { id: 0, position: [x, 1, 2], quaternion: [0, Math.sin(half), 0, Math.cos(half)], fov };
}

describe('presence throttle', () => {
  it('sends the first sample, then only visible changes at most every interval', () => {
    const throttle = new ThrottleCollaborationPresence();
    expect(throttle.due([entry(0)], 0)).toBe(true);
    throttle.mark([entry(0)], 0);
    const gap = THROTTLE_COLLABORATION_PRESENCE_INTERVAL_MS - THROTTLE_COLLABORATION_PRESENCE_SLACK_MS;
    expect(throttle.due([entry(5)], gap - 1)).toBe(false);
    expect(throttle.due([entry(0.005)], 1000)).toBe(false);
    expect(throttle.due([entry(0, 0.2)], 1000)).toBe(false);
    expect(throttle.due([entry(5)], THROTTLE_COLLABORATION_PRESENCE_INTERVAL_MS)).toBe(true);
  });

  it('keeps a 200 ms cadence when the 100 ms sample timer fires a little early', () => {
    const throttle = new ThrottleCollaborationPresence();
    const sentAt: number[] = [];
    for (let tick = 0; tick < 20; tick++) {
      const now = tick * 97;
      if (!throttle.due([entry(tick)], now)) continue;
      throttle.mark([entry(tick)], now);
      sentAt.push(now);
    }
    const gaps = sentAt.slice(1).map((time, index) => time - (sentAt[index] ?? 0));
    expect(gaps.every((gap) => gap === 194)).toBe(true);
  });

  it('sends a trailing update once motion stops between two frames', () => {
    const throttle = new ThrottleCollaborationPresence();
    throttle.mark([entry(0)], 0);
    expect(throttle.due([entry(1)], 100)).toBe(false);
    expect(throttle.due([entry(2)], 300)).toBe(true);
    throttle.mark([entry(2)], 300);
    expect(throttle.due([entry(2.5)], 400)).toBe(false);
    expect(throttle.due([entry(2.5)], 520)).toBe(true);
    throttle.mark([entry(2.5)], 520);
    expect(throttle.due([entry(2.5)], 5000)).toBe(false);
  });

  it('treats field of view, rotation and entry set changes as visible', () => {
    expect(presenceCollaborationEntriesClose([entry(0)], [entry(0, 0, 60)])).toBe(false);
    expect(presenceCollaborationEntriesClose([entry(0)], [entry(0, 2)])).toBe(false);
    expect(presenceCollaborationEntriesClose([entry(0)], [])).toBe(false);
    expect(presenceCollaborationAngle([0, 0, 0, 1], [0, 0, 0, -1])).toBeCloseTo(0);
    expect(presenceCollaborationAngle(entry(0).quaternion, entry(0, 90).quaternion)).toBeCloseTo(90);
  });

  it('sends again after a reset', () => {
    const throttle = new ThrottleCollaborationPresence();
    throttle.mark([entry(0)], 1000);
    throttle.reset();
    expect(throttle.due([entry(0)], 1001)).toBe(true);
  });
});
