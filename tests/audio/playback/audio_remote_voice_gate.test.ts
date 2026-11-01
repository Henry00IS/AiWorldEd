import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { NotificationRemoteSound } from '@/audio/notification/notification_frame_events.js';
import {
  AUDIO_REMOTE_AUDIBLE_METERS,
  AUDIO_REMOTE_FULL_METERS,
  AUDIO_REMOTE_VOICE_MS,
  AUDIO_REMOTE_VOICES_MAXIMUM,
  AudioRemoteVoiceGate,
  audioRemoteAttenuation,
  audioRemoteSoundShape,
} from '@/audio/playback/audio_remote_voice_gate.js';

/**
 * Builds a step at a distance along X.
 *
 * @param x Distance.
 * @returns Sound.
 */
function step(x: number): NotificationRemoteSound {
  return { kind: 'step', x, y: 0, z: 0, strength: 3 };
}

describe('audioRemoteAttenuation', () => {
  it('is full nearby, falls smoothly and is silent far away', () => {
    expect(audioRemoteAttenuation(0)).toBe(1);
    expect(audioRemoteAttenuation(AUDIO_REMOTE_FULL_METERS)).toBe(1);
    const mid = audioRemoteAttenuation((AUDIO_REMOTE_FULL_METERS + AUDIO_REMOTE_AUDIBLE_METERS) / 2);
    expect(mid).toBeCloseTo(0.25, 6);
    expect(audioRemoteAttenuation(AUDIO_REMOTE_AUDIBLE_METERS)).toBe(0);
    expect(audioRemoteAttenuation(Number.NaN)).toBe(0);
    for (let d = 0; d < 50; d += 1)
      expect(audioRemoteAttenuation(d + 1)).toBeLessThanOrEqual(audioRemoteAttenuation(d));
  });
});

describe('AudioRemoteVoiceGate', () => {
  it('plays the nearest audible sound first, one per frame', () => {
    const gate = new AudioRemoteVoiceGate();
    const chosen = gate.select([step(20), step(2), step(60)], new THREE.Vector3(), 0);
    expect(chosen.map((voice) => voice.sound.x)).toEqual([2]);
    expect(gate.select([step(60)], new THREE.Vector3(), 10)).toEqual([]);
  });

  it('caps voices playing at once and frees them after they end', () => {
    const gate = new AudioRemoteVoiceGate();
    const listener = new THREE.Vector3();
    for (let index = 0; index < AUDIO_REMOTE_VOICES_MAXIMUM; index++)
      expect(gate.select([step(1)], listener, index)).toHaveLength(1);
    expect(gate.select([step(1)], listener, AUDIO_REMOTE_VOICES_MAXIMUM)).toHaveLength(0);
    expect(gate.select([step(1)], listener, AUDIO_REMOTE_VOICE_MS + 1)).toHaveLength(1);
    gate.reset();
    expect(gate.select([step(1), step(2)], listener, 0, 5)).toHaveLength(2);
  });

  it('measures distance from the listener', () => {
    const gate = new AudioRemoteVoiceGate();
    const chosen = gate.select([step(100)], new THREE.Vector3(99, 0, 0), 0);
    expect(chosen[0]?.gain).toBeGreaterThan(0.5);
  });
});

describe('audioRemoteSoundShape', () => {
  it('shapes jumps light and landings heavier with fall speed', () => {
    expect(audioRemoteSoundShape(step(0), 1.1)).toEqual({ rate: 1.1, level: 1 });
    expect(audioRemoteSoundShape({ ...step(0), kind: 'jump' }, 1).rate).toBeGreaterThan(1);
    const soft = audioRemoteSoundShape({ ...step(0), kind: 'land', strength: 2 }, 1);
    const hard = audioRemoteSoundShape({ ...step(0), kind: 'land', strength: 12 }, 1);
    expect(hard.level).toBeGreaterThan(soft.level);
    expect(hard.rate).toBeLessThan(soft.rate);
    expect(audioRemoteSoundShape({ ...step(0), kind: 'land', strength: 1e9 }, 1).level).toBeLessThanOrEqual(1.4);
  });
});
