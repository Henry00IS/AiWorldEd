import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PLAYER_KEYBOARD_PLAYBACK_DELAY_MS } from '@/player/keyboard/player_keyboard_constants.js';
import type { PlayerKeyboardPacket } from '@/player/keyboard/player_keyboard_protocol.js';
import { PlayerKeyboardRemote } from '@/player/keyboard/player_keyboard_remote.js';
import { PlayerKeyboardSynth } from '@/player/keyboard/player_keyboard_synth.js';
import { playerKeyboardFakeAudio } from './player_keyboard_fake_audio.js';

/**
 * Builds an entry with note events at given sender times.
 *
 * @param base First counter.
 * @param events Pitch (negative: release) and time per event.
 * @param released All-released bit.
 * @returns Packet.
 */
function packet(base: number, events: [number, number][], released = false): PlayerKeyboardPacket {
  return {
    position: [0, 0, 0],
    yaw: 0,
    instrument: 0,
    base,
    events: events.map(([value, time], index) => ({
      counter: base + index,
      value: Math.abs(value),
      down: value > 0,
      time,
    })),
    ...(released ? { released } : {}),
  };
}

describe('PlayerKeyboardRemote all-released frames', () => {
  afterEach(() => vi.restoreAllMocks());

  it('releases a held note only once every event up to the frame has played, and never one pressed just before the frame', () => {
    const audio = playerKeyboardFakeAudio();
    const view = { helperAdd: (_: THREE.Object3D) => undefined, helperRemove: (_: THREE.Object3D) => undefined };
    const remote = new PlayerKeyboardRemote(view, 0xffffff, () => new PlayerKeyboardSynth(() => audio.context));
    const due = (tick: number): number => tick + PLAYER_KEYBOARD_PLAYBACK_DELAY_MS;
    remote.incoming(packet(0, []), 0, 0);
    remote.incoming(packet(0, [[60, 1000]]), 1000, 1000);
    remote.incoming(packet(1, [[64, 1990]], true), 2000, 2000);
    remote.showDue(due(2000) - 1);
    expect([remote.getHeldPitches(), remote.stuckReleased]).toEqual([[60, 64], []]);
    remote.showDue(due(2000));
    expect([remote.getHeldPitches(), remote.stuckReleased]).toEqual([[64], [60]]);
    remote.incoming(packet(1, [], true), 2200, 2200);
    remote.showDue(due(2200));
    expect([remote.getHeldPitches(), remote.stuckReleased]).toEqual([[], [60, 64]]);
    expect(remote.synth.getVoiceCount()).toBe(0);
  });
});
