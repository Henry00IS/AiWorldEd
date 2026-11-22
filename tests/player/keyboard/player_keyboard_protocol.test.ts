import { describe, expect, it } from 'vitest';
import { toyFrameCheck, toyFrameDecode, toyFrameEncode, toyFrameRelay } from '@/collaboration/shared/toy_frame.js';
import { toyTennisBallDecode, toyTennisBallEncode } from '@/collaboration/toys/toy_tennis_ball.js';
import { PLAYER_KEYBOARD_EVENTS_PER_ENTRY } from '@/player/keyboard/player_keyboard_constants.js';
import {
  playerKeyboardDecode,
  playerKeyboardEncode,
  playerKeyboardEntriesFind,
  playerKeyboardEventInstrument,
  playerKeyboardEventIsNote,
  playerKeyboardEventOctave,
  playerKeyboardEventVibrato,
  TOY_TYPE_KEYBOARD,
  type PlayerKeyboardPacket,
} from '@/player/keyboard/player_keyboard_protocol.js';

/**
 * Builds a packet with notes 1 ms apart.
 *
 * @param count Events.
 * @param base First counter.
 * @returns Packet.
 */
function packet(count: number, base = 254): PlayerKeyboardPacket {
  const events = Array.from({ length: count }, (_, index) => ({
    counter: (base + index) & 255,
    value: 60 + index,
    down: index % 2 === 0,
    time: 1000 + index * 10,
  }));
  return { position: [1, 0, -2], yaw: Math.PI / 2, instrument: 2, base, events };
}

describe('player keyboard protocol', () => {
  it('round-trips placement, instrument and events with their age in 2 ms steps, counters wrapping', () => {
    const entry = playerKeyboardEncode(packet(3), 1100);
    expect([entry.type, entry.id, entry.payload.byteLength]).toEqual([TOY_TYPE_KEYBOARD, 4, 9]);
    const decoded = playerKeyboardDecode(entry, 5100);
    expect(decoded?.instrument).toBe(2);
    expect(decoded?.yaw).toBeCloseTo(Math.PI / 2, 2);
    expect(decoded?.events).toEqual([
      { counter: 254, value: 60, down: true, time: 5000 },
      { counter: 255, value: 61, down: false, time: 5010 },
      { counter: 0, value: 62, down: true, time: 5020 },
    ]);
  });

  it('writes at most nine events, fits the relay limits and survives a relayed toy frame next to a ball', () => {
    const entry = playerKeyboardEncode(packet(12), 1200);
    expect(entry.payload.byteLength).toBe(3 + 2 * PLAYER_KEYBOARD_EVENTS_PER_ENTRY);
    expect(entry.payload.byteLength).toBeLessThanOrEqual(22);
    const ball = {
      id: 1,
      position: [0, 1, 0],
      velocity: [1, 0, 0],
      sleeping: false,
      rolling: false,
      bounces: 0,
      strength: 0,
    };
    const snapshot = { full: true, tick: 7, balls: [ball as never], held: 'keyboard' as const, keyboard: [entry] };
    const frame = toyFrameEncode(toyTennisBallEncode(snapshot));
    expect(toyFrameCheck(frame)).toBe(true);
    const relayed = toyFrameDecode(toyFrameRelay(frame, 3));
    const balls = relayed && toyTennisBallDecode(relayed);
    expect([balls?.balls.length, balls?.held]).toEqual([1, 'keyboard']);
    expect(balls?.keyboard?.[0] && playerKeyboardDecode(balls.keyboard[0], 0)?.events.length).toBe(9);
    expect(relayed && playerKeyboardEntriesFind(relayed.entries).map((found) => found.type)).toEqual([
      TOY_TYPE_KEYBOARD,
    ]);
  });

  it('rejects odd payloads, too many events and unknown instrument byte bits; tells switches from notes', () => {
    const entry = playerKeyboardEncode(packet(1), 1000);
    expect(playerKeyboardDecode({ ...entry, payload: entry.payload.slice(0, 4) }, 0)).toBeNull();
    expect(playerKeyboardDecode({ ...entry, payload: new Uint8Array(3 + 20) }, 0)).toBeNull();
    expect(playerKeyboardDecode({ ...entry, payload: Uint8Array.of(0, 0, 128) }, 0)).toBeNull();
    expect(playerKeyboardDecode({ ...entry, type: 1 }, 0)).toBeNull();
    expect(playerKeyboardEventInstrument({ value: 121, down: true })).toBe(1);
    expect(playerKeyboardEventInstrument({ value: 72, down: true })).toBeNull();
  });

  it('carries the octave in bit 6, and tells octave shifts from notes', () => {
    const entry = playerKeyboardEncode({ ...packet(1), octave: true }, 1000);
    expect(entry.payload[2]).toBe(2 | 64);
    expect(playerKeyboardDecode(entry, 0)).toMatchObject({ instrument: 2, octave: true });
    expect(playerKeyboardDecode(playerKeyboardEncode(packet(1), 1000), 0)?.octave).toBeUndefined();
    const shifts = [116, 117, 118, 79].map((value) => playerKeyboardEventOctave({ value, down: true }));
    expect(shifts).toEqual([true, false, null, null]);
    expect([116, 117, 115].map((value) => playerKeyboardEventIsNote({ value }))).toEqual([false, false, true]);
  });

  it('carries the vibrato and all-released bits next to the continuation bit, and tells vibrato toggles from notes', () => {
    const flags = { vibrato: true, released: true, continuation: true };
    const entry = playerKeyboardEncode({ ...packet(1), ...flags }, 1000);
    expect(entry.payload[2]).toBe(2 | 8 | 16 | 32);
    expect(playerKeyboardDecode(entry, 0)).toMatchObject({ instrument: 2, ...flags });
    const plain = playerKeyboardDecode(playerKeyboardEncode(packet(1), 1000), 0);
    expect([plain?.vibrato, plain?.released, plain?.continuation]).toEqual([undefined, undefined, undefined]);
    expect([118, 119, 72].map((value) => playerKeyboardEventVibrato({ value, down: true }))).toEqual([
      true,
      false,
      null,
    ]);
    expect([118, 119, 120, 79].map((value) => playerKeyboardEventIsNote({ value }))).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});
