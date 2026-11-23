import { describe, expect, it } from 'vitest';
import type { PlayerKeyboardPacket } from '@/player/keyboard/player_keyboard_protocol.js';
import { PlayerKeyboardReceiver } from '@/player/keyboard/player_keyboard_receiver.js';

/**
 * Builds a packet of notes from a counter on.
 *
 * @param base First counter.
 * @param values Event values (positive: down, negative: up).
 * @param instrument Instrument before the first event.
 * @returns Packet.
 */
function packet(base: number, values: number[], instrument = 0): PlayerKeyboardPacket {
  const events = values.map((value, index) => ({
    counter: (base + index) & 255,
    value: Math.abs(value),
    down: value > 0,
    time: index,
  }));
  return { position: [0, 0, 0], yaw: 0, instrument, base, events };
}

describe('PlayerKeyboardReceiver', () => {
  it('takes the first entry as the baseline, then accepts each event once in order', () => {
    const receiver = new PlayerKeyboardReceiver();
    expect(receiver.accept(packet(10, [60, -60]))).toEqual([]);
    const notes = receiver.accept(packet(10, [60, -60, 62, -62]));
    expect(notes.map((note) => [note.counter, note.pitch, note.down])).toEqual([
      [12, 62, true],
      [13, 62, false],
    ]);
    expect(receiver.accept(packet(12, [62, -62]))).toEqual([]);
    expect(receiver.stats).toEqual({ accepted: 2, duplicates: 4, missing: 0 });
  });

  it('counts events lost in both of their frames and resyncs the instrument from the header', () => {
    const receiver = new PlayerKeyboardReceiver();
    receiver.accept(packet(250, []));
    receiver.accept(packet(250, [60, -60]));
    const notes = receiver.accept(packet(5, [64, -64], 2));
    expect(receiver.stats.missing).toBe(9);
    expect(notes.map((note) => [note.counter, note.instrument])).toEqual([
      [5, 2],
      [6, 2],
    ]);
  });

  it('applies instrument switches in stream order and stamps the notes after them', () => {
    const receiver = new PlayerKeyboardReceiver();
    receiver.accept(packet(0, []));
    const notes = receiver.accept(packet(0, [60, 122, 62]));
    expect(notes.map((note) => [note.pitch, note.instrument])).toEqual([
      [60, 0],
      [62, 2],
    ]);
    expect(receiver.getInstrument()).toBe(2);
  });

  it('applies octave shifts by stream position, recovering a lost shift from the header', () => {
    const receiver = new PlayerKeyboardReceiver();
    receiver.accept(packet(0, []));
    const notes = receiver.accept(packet(0, [60, 116, 62, -60, 117, -62]));
    expect(notes.map((note) => [note.pitch, note.down, note.transpose])).toEqual([
      [60, true, 0],
      [62, true, 12],
      [60, false, 12],
      [62, false, 0],
    ]);
    const recovered = receiver.accept({ ...packet(9, [64]), octave: true });
    expect(recovered.map((note) => note.transpose)).toEqual([12]);
    receiver.accept(packet(10, []));
    expect(receiver.accept(packet(10, [65])).map((note) => note.transpose)).toEqual([0]);
  });

  it('reports vibrato toggles at their time, and recovers a lost toggle from the header after a gap or in an empty entry', () => {
    const receiver = new PlayerKeyboardReceiver();
    receiver.accept({ ...packet(0, []), vibrato: true });
    expect(receiver.takeVibratoChanges()).toEqual([{ vibrato: true, time: 0 }]);
    const notes = receiver.accept(packet(0, [60, 119, 62]));
    expect(notes.map((note) => note.pitch)).toEqual([60, 62]);
    expect(receiver.takeVibratoChanges()).toEqual([{ vibrato: false, time: 1 }]);
    receiver.accept({ ...packet(5, [64]), vibrato: true });
    expect(receiver.takeVibratoChanges()).toEqual([{ vibrato: true, time: 0 }]);
    receiver.accept({ ...packet(6, []), vibrato: false });
    receiver.accept({ ...packet(6, []), vibrato: false });
    expect(receiver.takeVibratoChanges()).toEqual([{ vibrato: false, time: 0 }]);
  });
});
