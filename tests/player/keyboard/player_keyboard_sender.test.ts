import { describe, expect, it } from 'vitest';
import { playerKeyboardDecode, playerKeyboardEncode } from '@/player/keyboard/player_keyboard_protocol.js';
import { PlayerKeyboardReceiver, type PlayerKeyboardNote } from '@/player/keyboard/player_keyboard_receiver.js';
import { PlayerKeyboardSender } from '@/player/keyboard/player_keyboard_sender.js';

/**
 * Sends one frame and returns its counters.
 *
 * @param sender Sender.
 * @param now Frame time.
 * @returns Counters in the frame.
 */
function frame(sender: PlayerKeyboardSender, now: number): number[] {
  const window = sender.window(now);
  sender.sent(window);
  return window.events.map((event) => event.counter);
}

/**
 * Sends one frame through the wire format to a receiver.
 *
 * @param sender Sender.
 * @param receiver Receiver.
 * @param now Frame time.
 * @returns Notes the receiver got from the frame.
 */
function wire(sender: PlayerKeyboardSender, receiver: PlayerKeyboardReceiver, now: number): PlayerKeyboardNote[] {
  const window = sender.window(now);
  sender.sent(window);
  const entry = playerKeyboardEncode({ position: [0, 0, 0], yaw: 0, ...window }, now);
  const packet = playerKeyboardDecode(entry, now);
  return packet ? receiver.accept(packet) : [];
}

/**
 * Lists the values of a frame's events.
 *
 * @param sender Sender.
 * @param now Frame time.
 * @returns Value and down per event.
 */
function values(sender: PlayerKeyboardSender, now: number): [number, boolean][] {
  const window = sender.window(now);
  sender.sent(window);
  return window.events.map((event) => [event.value, event.down]);
}

describe('PlayerKeyboardSender', () => {
  it('sends every event in two consecutive frames, then owes nothing', () => {
    const sender = new PlayerKeyboardSender();
    sender.record(60, true, 0);
    sender.record(60, false, 50);
    expect(sender.isOwing(100)).toBe(true);
    expect(frame(sender, 200)).toEqual([0, 1]);
    sender.record(62, true, 300);
    expect(frame(sender, 400)).toEqual([0, 1, 2]);
    expect(frame(sender, 600)).toEqual([2]);
    expect(sender.isOwing(700)).toBe(false);
    expect(frame(sender, 800)).toEqual([]);
  });

  it('skips ahead past a burst: the newest held notes go out at once, the dropped notes never sound or release', () => {
    const sender = new PlayerKeyboardSender();
    for (let index = 0; index < 14; index++) sender.record(60 + index, true, index);
    expect(values(sender, 100).map(([value]) => value)).toEqual([65, 66, 67, 68, 69, 70, 71, 72, 73]);
    for (let index = 0; index < 14; index++) sender.record(60 + index, false, 150 + index);
    expect(values(sender, 300).map(([value, down]) => [value, down])).toEqual(
      [65, 66, 67, 68, 69, 70, 71, 72, 73].map((value) => [value, false]),
    );
    expect(sender.isOwing(400)).toBe(true);
    frame(sender, 500);
    expect(sender.isOwing(600)).toBe(false);
  });

  it('always sends the release of a heard note before newer notes', () => {
    const sender = new PlayerKeyboardSender();
    sender.record(60, true, 0);
    frame(sender, 100);
    frame(sender, 300);
    sender.record(60, false, 310);
    for (let index = 0; index < 12; index++) sender.record(70 + index, true, 320 + index);
    const sent = values(sender, 400);
    expect(sent[0]).toEqual([60, false]);
    expect(sent.slice(1).map(([value]) => value)).toEqual([74, 75, 76, 77, 78, 79, 80, 81]);
  });

  it('collapses instrument switches into the latest one when over a frame', () => {
    const sender = new PlayerKeyboardSender();
    [121, 122, 123].forEach((value, index) => sender.record(value, true, index));
    for (let index = 0; index < 10; index++) sender.record(60 + index, true, 10 + index);
    const sent = values(sender, 100);
    expect(sent.filter(([value]) => value >= 120)).toEqual([[123, true]]);
    expect(sent).toHaveLength(9);
    expect(sender.getInstrument()).toBe(3);
  });

  it('drops a note-on too old for a frame together with its later release', () => {
    const sender = new PlayerKeyboardSender();
    sender.record(60, true, 0);
    expect(values(sender, 600)).toEqual([]);
    sender.record(60, false, 700);
    expect(sender.isOwing(800)).toBe(false);
  });

  it('keeps a mash of 40 keys in 200 ms free of stuck notes, double voices and clustered starts', () => {
    const sender = new PlayerKeyboardSender();
    const receiver = new PlayerKeyboardReceiver();
    wire(sender, receiver, 0);
    const notes: PlayerKeyboardNote[] = [];
    const events = Array.from({ length: 40 }, (_, index) => {
      const pitch = 60 + (index % 32);
      const time = 1 + index * 5;
      return [
        { pitch, down: true, time },
        { pitch, down: false, time: time + 15 },
      ];
    })
      .flat()
      .sort((a, b) => a.time - b.time);
    for (let now = 1; now <= 1200; now++) {
      events.filter((event) => event.time === now).forEach(({ pitch, down, time }) => sender.record(pitch, down, time));
      if (now % 200 === 0) notes.push(...wire(sender, receiver, now));
    }
    const sounding = new Set<number>();
    notes.forEach((note) => {
      expect(sounding.has(note.pitch)).toBe(!note.down);
      if (note.down) sounding.add(note.pitch);
      else sounding.delete(note.pitch);
    });
    expect([...sounding]).toEqual([]);
    const starts = notes.filter((note) => note.down).map((note) => note.time);
    expect(starts.length).toBeGreaterThanOrEqual(4);
    expect(starts.length).toBeLessThanOrEqual(9);
    expect(starts.at(-1)).toBe(196);
    starts.slice(1).forEach((start, index) => expect(start - (starts[index] ?? 0)).toBeGreaterThanOrEqual(4));
    expect(receiver.stats.missing).toBe(0);
  });

  it('keeps counting across put-aways and wraps at 256', () => {
    const sender = new PlayerKeyboardSender();
    for (let index = 0; index < 255; index++) {
      sender.record(60, index % 2 === 0, index);
      frame(sender, index);
    }
    sender.clear();
    sender.record(61, true, 1000);
    sender.record(61, false, 1001);
    expect(frame(sender, 1100)).toEqual([255, 0]);
  });

  it('carries the instrument before the window and after every switch', () => {
    const sender = new PlayerKeyboardSender();
    sender.record(121, true, 0);
    expect(sender.getInstrument()).toBe(1);
    sender.record(60, true, 10);
    frame(sender, 100);
    frame(sender, 300);
    sender.record(62, true, 400);
    expect(sender.window(500).instrument).toBe(1);
    expect(sender.window(500).base).toBe(2);
  });

  it('streams vibrato toggles as events with the state before the window, collapsing them when over a frame', () => {
    const sender = new PlayerKeyboardSender();
    sender.record(118, true, 0);
    expect([sender.getVibrato(), sender.window(1).vibrato]).toEqual([true, false]);
    [119, 118, 119].forEach((value, index) => sender.record(value, true, 1 + index));
    for (let index = 0; index < 9; index++) sender.record(60 + index, true, 10 + index);
    const sent = values(sender, 100);
    expect(sent.filter(([value]) => value === 118 || value === 119)).toEqual([[119, true]]);
    expect(sent).toHaveLength(9);
    expect(sender.getVibrato()).toBe(false);
  });

  it('streams octave shifts with the state before the window, collapsing them when over a frame', () => {
    const sender = new PlayerKeyboardSender();
    sender.record(116, true, 0);
    expect([sender.getOctave(), sender.window(1).octave]).toEqual([true, false]);
    [117, 116, 117].forEach((value, index) => sender.record(value, true, 1 + index));
    for (let index = 0; index < 9; index++) sender.record(60 + index, true, 10 + index);
    const sent = values(sender, 100);
    expect(sent.filter(([value]) => value === 116 || value === 117)).toEqual([[117, true]]);
    expect(sent).toHaveLength(9);
    expect(sender.getOctave()).toBe(false);
  });

  it('owes two empty all-released frames after the last event once no key is held', () => {
    const sender = new PlayerKeyboardSender();
    sender.record(60, true, 0);
    sender.record(60, false, 10);
    [20, 30].forEach((now) => sender.sent(sender.window(now, 1, true)));
    expect([sender.isOwing(40), sender.isOwing(40, true)]).toEqual([false, true]);
    const empty = sender.window(40, 1, true);
    expect([empty.events.length, empty.released]).toEqual([0, true]);
    sender.sent(empty);
    sender.sent(sender.window(50, 1, true));
    expect(sender.isOwing(60, true)).toBe(false);
  });
});
