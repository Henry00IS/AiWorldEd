import { describe, expect, it } from 'vitest';
import {
  SOUND_COLLABORATION_PRESENCE_TELEPORT_MS,
  SoundCollaborationPresence,
  type SoundCollaborationPresenceKind,
} from '@/collaboration/presence/sound_collaboration_presence.js';

/**
 * Builds a sound tracker that records what it plays.
 *
 * @returns Tracker and the record.
 */
function recorder(): {
  sound: SoundCollaborationPresence;
  played: { kind: SoundCollaborationPresenceKind; strength: number }[];
} {
  const played: { kind: SoundCollaborationPresenceKind; strength: number }[] = [];
  const sound = new SoundCollaborationPresence((kind, _x, _y, _z, strength) => played.push({ kind, strength }));
  return { sound, played };
}

/**
 * Plays a ballistic jump at 60 frames per second from a start time.
 *
 * @param sound Tracker.
 * @param start Start time.
 * @param up Initial upward speed (0 walks off a ledge).
 * @param floor Landing height.
 * @returns End time.
 */
function jump(sound: SoundCollaborationPresence, start: number, up: number, floor = 0): number {
  let now = start;
  sound.update(now, true, 0, 0, 0, 0);
  let y = 0;
  let vy = up;
  do {
    now += 1000 / 60;
    vy -= 20 / 60;
    y += vy / 60;
    const landed = y <= floor;
    sound.update(now, landed, 0, landed ? floor : y, 0, vy);
    if (landed) break;
  } while (now - start < 5000);
  return now;
}

describe('SoundCollaborationPresence', () => {
  it('plays one jump and one landing for a jump', () => {
    const { sound, played } = recorder();
    sound.update(0, true, 0, 0, 0, 0);
    jump(sound, 100, 6);
    expect(played.map((sound) => sound.kind)).toEqual(['jump', 'land']);
    expect(played[1]?.strength).toBeGreaterThan(4);
  });

  it('plays only a landing when walking off a ledge', () => {
    const { sound, played } = recorder();
    sound.update(0, true, 0, 0, 0, 0);
    jump(sound, 100, 0, -2);
    expect(played.map((sound) => sound.kind)).toEqual(['land']);
  });

  it('hears a jump at a low frame rate where the rise flattens out after the first airborne frame', () => {
    const { sound, played } = recorder();
    sound.update(0, true, 0, 0, 0, 0);
    sound.update(200, true, 0, 0, 0, 0);
    sound.update(420, false, 0, 0.8, 0, 1);
    sound.update(640, false, 0, 0.85, 0, -1);
    sound.update(860, true, 0, 0, 0, -5);
    expect(played.map((sound) => sound.kind)).toEqual(['jump', 'land']);
  });

  it('stays silent for a flicker off the ground', () => {
    const { sound, played } = recorder();
    sound.update(0, true, 0, 0, 0, 0);
    sound.update(16, false, 0, 0, 0, -0.5);
    sound.update(50, true, 0, 0, 0, 0);
    expect(played).toEqual([]);
  });

  it('dedupes jumps and landings repeated within the repeat window', () => {
    const { sound, played } = recorder();
    sound.update(0, true, 0, 0, 0, 0);
    let now = jump(sound, 100, 6);
    sound.update(now + 1, false, 0, 0.02, 0, 0.5);
    sound.update(now + 20, false, 0, 0.05, 0, 0.5);
    sound.update(now + 140, true, 0, 0, 0, 0);
    expect(played.map((sound) => sound.kind)).toEqual(['jump', 'land']);
    now = jump(sound, now + 600, 6);
    expect(played.map((sound) => sound.kind)).toEqual(['jump', 'land', 'jump', 'land']);
  });

  it('plays nothing for a teleport and its first frames', () => {
    const { sound, played } = recorder();
    sound.update(0, true, 0, 0, 0, 0);
    sound.teleport(100);
    sound.update(100, false, 0, 50, 0, 0);
    sound.update(150, true, 0, 0, 0, 0);
    sound.step(0, 0, 0, 3, 200);
    sound.update(200, false, 0, 0.5, 0, 6);
    sound.update(450, true, 0, 0, 0, 0);
    expect(played).toEqual([]);
    sound.step(0, 0, 0, 3, 100 + SOUND_COLLABORATION_PRESENCE_TELEPORT_MS);
    expect(played.map((sound) => sound.kind)).toEqual(['step']);
  });

  it('passes footsteps with their speed on', () => {
    const { sound, played } = recorder();
    sound.step(1, 2, 3, 4.5, 10);
    expect(played).toEqual([{ kind: 'step', strength: 4.5 }]);
  });
});
