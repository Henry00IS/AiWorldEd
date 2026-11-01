import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CharacterCollaborationPresence,
  type CharacterCollaborationModel,
} from '@/collaboration/presence/character_collaboration_presence.js';
import {
  lookCollaborationPresenceEncode,
  lookCollaborationPresenceFlags,
} from '@/collaboration/presence/look_collaboration_presence.js';
import type { SoundCollaborationPresenceKind } from '@/collaboration/presence/sound_collaboration_presence.js';
import { PRESENCE_ID_CHARACTER, type PresenceEntry } from '@/collaboration/shared/presence_frame.js';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Model without bones (the animation runs, nothing is skinned). */
const model: CharacterCollaborationModel = {
  ready: () => true,
  load: () => Promise.resolve(),
  build: () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    return { root, bones: new Map(), restLocalQuaternions: new Map() };
  },
};

/** Sent motion and pose of a remote member. */
interface Sent {
  x: number;
  y?: number;
  z?: number;
  bodyYaw?: number;
  lookYaw?: number;
  pitch?: number;
  grounded?: boolean;
  wallPushing?: boolean;
  running?: boolean;
}

/**
 * Builds a character entry.
 *
 * @param sent Sent state.
 * @returns Entry.
 */
function entry(sent: Sent): PresenceEntry {
  const bodyYaw = sent.bodyYaw ?? 0;
  const q = lookCollaborationPresenceEncode(bodyYaw, sent.lookYaw ?? bodyYaw, sent.pitch ?? 0, new THREE.Quaternion());
  return {
    id: PRESENCE_ID_CHARACTER,
    position: [sent.x, sent.y ?? 0, sent.z ?? 0],
    quaternion: [q.x, q.y, q.z, q.w],
    fov: lookCollaborationPresenceFlags({
      grounded: sent.grounded ?? true,
      wallPushing: sent.wallPushing ?? false,
      running: sent.running ?? false,
    }),
  };
}

/**
 * Drives a character: 5 Hz entries, 60 Hz frames.
 *
 * @param seconds Duration.
 * @param state Sent state at a time in seconds (null sends nothing).
 * @returns Character, the sounds it played with their times, and the end time.
 */
function drive(
  seconds: number,
  state: (t: number) => Sent | null,
): {
  character: CharacterCollaborationPresence;
  sounds: { kind: SoundCollaborationPresenceKind; now: number; strength: number }[];
  now: number;
  active: boolean;
} {
  const sounds: { kind: SoundCollaborationPresenceKind; now: number; strength: number }[] = [];
  const character = new CharacterCollaborationPresence('Bea', 0x44aaff, model, (kind, _x, _y, _z, strength) =>
    sounds.push({ kind, now, strength }),
  );
  let now = 0;
  let active = false;
  let nextSend = 0;
  while (now <= seconds * 1000) {
    if (now >= nextSend) {
      const sent = state(now / 1000);
      if (sent) character.target(entry(sent), now);
      nextSend += 200;
    }
    active = character.update(now);
    now += 1000 / 60;
  }
  return { character, sounds, now, active };
}

/**
 * Times between footsteps.
 *
 * @param sounds Played sounds.
 * @returns Intervals in milliseconds.
 */
function stepIntervals(sounds: { kind: string; now: number }[]): number[] {
  const steps = sounds.filter((sound) => sound.kind === 'step').map((sound) => sound.now);
  return steps.slice(1).map((time, index) => time - (steps[index] ?? 0));
}

describe('CharacterCollaborationPresence', () => {
  it('walks with footsteps in rhythm, runs with faster ones', () => {
    const walk = drive(4, (t) => ({ x: 3 * t }));
    expect(walk.character.animation()).toBe('walk');
    const walkSteps = stepIntervals(walk.sounds.filter((sound) => sound.now > 1500));
    expect(walkSteps.length).toBeGreaterThan(3);
    const walkMean = walkSteps.reduce((sum, value) => sum + value, 0) / walkSteps.length;
    walkSteps.forEach((interval) => expect(Math.abs(interval - walkMean)).toBeLessThan(walkMean * 0.35));

    const run = drive(4, (t) => ({ x: 7 * t, running: true }));
    expect(run.character.animation()).toBe('run');
    const runSteps = stepIntervals(run.sounds.filter((sound) => sound.now > 1500));
    const runMean = runSteps.reduce((sum, value) => sum + value, 0) / runSteps.length;
    expect(runMean).toBeLessThan(walkMean);
    expect(run.sounds.every((sound) => sound.kind === 'step')).toBe(true);
  });

  it('stands idle and comes to rest without footsteps', () => {
    const idle = drive(3, (t) => (t < 0.5 ? { x: 1 } : null));
    expect(idle.character.animation()).toBe('idle');
    expect(idle.sounds).toEqual([]);
    expect(idle.active).toBe(false);
  });

  it('pushes a wall facing it', () => {
    const push = drive(2, () => ({ x: 0, bodyYaw: 1.2, wallPushing: true }));
    expect(push.character.animation()).toMatch(/^wall_/);
    const body = push.character.object.children[0] as THREE.Object3D;
    expect(body.rotation.y).toBeCloseTo(1.2, 2);
    expect(push.active).toBe(true);
  });

  it('turns the body with the member and the head with their look', () => {
    const turn = drive(2, (t) => ({ x: 0, bodyYaw: Math.min(1, t), lookYaw: Math.min(1, t) + 0.5, pitch: 0.4 }));
    const body = turn.character.object.children[0] as THREE.Object3D;
    expect(body.rotation.y).toBeCloseTo(1, 2);
    expect(turn.character.look().yaw).toBeCloseTo(0.5, 1);
    expect(turn.character.look().pitch).toBeCloseTo(0.4, 2);
  });

  it('jumps and lands with one sound each', () => {
    const jump = drive(3, (t) => {
      const air = t > 1 && t < 1.8;
      const y = air ? 5 * (t - 1) - 6.25 * (t - 1) * (t - 1) : 0;
      return { x: 0, y: Math.max(0, y), grounded: !air };
    });
    expect(jump.sounds.map((sound) => sound.kind)).toEqual(['jump', 'land']);
  });

  it('plays no landing or footsteps after a teleport', () => {
    const teleport = drive(2, (t) => (t < 1 ? { x: 0, y: 0 } : { x: 40, y: -20, grounded: t > 1.1 }));
    expect(teleport.sounds).toEqual([]);
  });
});
