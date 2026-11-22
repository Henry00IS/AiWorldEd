import { describe, expect, it } from 'vitest';
import { toyFrameCheck, toyFrameEncode } from '@/collaboration/shared/toy_frame.js';
import { toyTennisBallEncode } from '@/collaboration/toys/toy_tennis_ball.js';
import { playerKeyboardEntriesDecode, playerKeyboardEntriesEncode } from '@/player/keyboard/player_keyboard_entries.js';
import { PlayerKeyboardReceiver } from '@/player/keyboard/player_keyboard_receiver.js';
import { PlayerKeyboardSender } from '@/player/keyboard/player_keyboard_sender.js';

/**
 * Encodes a sender's two-entry window, marking it delivered.
 *
 * @param sender Sender.
 * @param now Frame time.
 * @returns Entries.
 */
function entriesOf(sender: PlayerKeyboardSender, now: number) {
  const window = sender.window(now, 2);
  sender.sent(window);
  return playerKeyboardEntriesEncode({ position: [1, 0, 0], yaw: 0, ...window }, now, 3);
}

/**
 * Decodes entries and accepts the run on a receiver.
 *
 * @param receiver Receiver.
 * @param entries Entries.
 * @param now Time.
 * @returns Notes.
 */
function accept(receiver: PlayerKeyboardReceiver, entries: ReturnType<typeof entriesOf>, now: number) {
  const packet = playerKeyboardEntriesDecode(entries, now);
  return packet ? receiver.accept(packet) : [];
}

describe('keyboard continuation entries', () => {
  it('fits 18 events into two entries of the same type, bit 3 only, and the relay accepts them', () => {
    const sender = new PlayerKeyboardSender();
    Array.from({ length: 18 }, (_, index) => sender.record(48 + index, true, 100));
    const entries = entriesOf(sender, 100);
    expect(entries.map((entry) => [entry.type, entry.id, entry.payload.length, entry.payload[2]])).toEqual([
      [4, 4, 21, 0],
      [4, 3, 21, 8],
    ]);
    const snapshot = { full: true, tick: 10, held: 'keyboard' as const, balls: [], keyboard: entries };
    expect(toyFrameCheck(toyFrameEncode(toyTennisBallEncode(snapshot)))).toBe(true);
  });

  it('merges in counter order regardless of entry order and drops copies, also across counter wrap', () => {
    const sender = new PlayerKeyboardSender();
    const receiver = new PlayerKeyboardReceiver();
    accept(receiver, entriesOf(sender, 0), 0);
    for (let index = 0; index < 15; index++) {
      Array.from({ length: 18 }, (_, i) => sender.record(48 + i, true, index * 10));
      const entries = entriesOf(sender, index * 10);
      expect(accept(receiver, entries.reverse(), index * 10)).toHaveLength(18);
      expect(accept(receiver, entriesOf(sender, index * 10), index * 10)).toEqual([]);
    }
    expect(receiver.stats.missing).toBe(0);
    expect(receiver.stats.accepted).toBe(270);
  });

  it('carries the right instrument into the continuation and baselines the whole pair on first contact', () => {
    const sender = new PlayerKeyboardSender();
    Array.from({ length: 8 }, (_, i) => sender.record(48 + i, true, 0));
    sender.record(124, true, 0);
    sender.record(60, true, 0);
    const entries = entriesOf(sender, 0);
    expect(entries[1]?.payload[2]).toBe(12);
    const receiver = new PlayerKeyboardReceiver();
    expect(accept(receiver, entries, 0)).toEqual([]);
    expect(accept(receiver, entries, 0)).toEqual([]);
    expect(receiver.getInstrument()).toBe(4);
  });

  it('carries the vibrato toggled in the first entry into the continuation header', () => {
    const sender = new PlayerKeyboardSender();
    Array.from({ length: 8 }, (_, i) => sender.record(48 + i, true, 0));
    sender.record(118, true, 0);
    sender.record(60, true, 0);
    expect(entriesOf(sender, 0).map((entry) => entry.payload[2])).toEqual([0, 8 | 16]);
  });

  it('carries the octave shifted in the first entry into the continuation header', () => {
    const sender = new PlayerKeyboardSender();
    Array.from({ length: 8 }, (_, i) => sender.record(48 + i, true, 0));
    sender.record(116, true, 0);
    sender.record(60, true, 0);
    expect(entriesOf(sender, 0).map((entry) => entry.payload[2])).toEqual([0, 8 | 64]);
  });

  it('only emits one entry when it fits, skips ahead beyond 18 and releases all heard notes', () => {
    const sender = new PlayerKeyboardSender();
    const receiver = new PlayerKeyboardReceiver();
    accept(receiver, entriesOf(sender, 0), 0);
    Array.from({ length: 32 }, (_, i) => sender.record(48 + i, true, 10));
    const heard = accept(receiver, entriesOf(sender, 10), 10);
    expect(heard).toHaveLength(18);
    expect(heard[0]?.pitch).toBe(62);
    Array.from({ length: 32 }, (_, i) => sender.record(48 + i, false, 20));
    const offs = accept(receiver, entriesOf(sender, 20), 20);
    expect(offs.map((note) => note.pitch)).toEqual(heard.map((note) => note.pitch));
    entriesOf(sender, 20);
    expect(entriesOf(sender, 30)).toHaveLength(1);
    expect(receiver.stats.missing).toBe(0);
  });
});
