import type { ToyEntry } from '@/collaboration/shared/toy_frame.js';
import { PLAYER_KEYBOARD_COUNTER_RANGE, PLAYER_KEYBOARD_EVENTS_PER_ENTRY } from './player_keyboard_constants.js';
import {
  playerKeyboardDecode,
  playerKeyboardEncode,
  playerKeyboardEventInstrument,
  playerKeyboardEventOctave,
  playerKeyboardEventVibrato,
  type PlayerKeyboardPacket,
} from './player_keyboard_protocol.js';

/**
 * Builds the keyboard's entries for a frame: the first entry, and while the
 * window holds more than one entry's events a continuation entry under another
 * toy id, of the same keyboard toy type and marked only by the continuation
 * bit, carrying the rest of the run with the instrument, vibrato and octave in
 * effect before it.
 *
 * @param packet Placement and the event window.
 * @param time Time of the frame tick in milliseconds.
 * @param extraId Toy id for the continuation entry, or null without one.
 * @returns Entries.
 */
export function playerKeyboardEntriesEncode(
  packet: PlayerKeyboardPacket,
  time: number,
  extraId: number | null,
): ToyEntry[] {
  const first = playerKeyboardEncode(packet, time);
  const head = packet.events.slice(0, PLAYER_KEYBOARD_EVENTS_PER_ENTRY);
  const rest = packet.events.slice(PLAYER_KEYBOARD_EVENTS_PER_ENTRY);
  if (extraId === null || !rest[0]) return [first];
  const instrument = head.reduce((slot, event) => playerKeyboardEventInstrument(event) ?? slot, packet.instrument);
  const vibrato = head.reduce((on, event) => playerKeyboardEventVibrato(event) ?? on, packet.vibrato ?? false);
  const octave = head.reduce((up, event) => playerKeyboardEventOctave(event) ?? up, packet.octave ?? false);
  const more = { ...packet, instrument, vibrato, octave, continuation: true, base: rest[0].counter, events: rest };
  return [first, { ...playerKeyboardEncode(more, time), id: extraId }];
}

/**
 * Reads a frame's keyboard entries as one keyboard: the continuation's events
 * follow the first entry's in counter order, so receivers see one contiguous
 * run (one stand, one stream). Malformed entries are skipped.
 *
 * @param entries Keyboard entries of one frame.
 * @param time Local time of the frame tick in milliseconds.
 * @returns Packet, or null when no entry is readable.
 */
export function playerKeyboardEntriesDecode(entries: readonly ToyEntry[], time: number): PlayerKeyboardPacket | null {
  const packets = entries.flatMap((entry) => playerKeyboardDecode(entry, time) ?? []);
  const first = packets.find((packet) => !packet.continuation) ?? packets[0];
  if (!first) return null;
  const after = (counter: number): number =>
    (counter - first.base + PLAYER_KEYBOARD_COUNTER_RANGE) % PLAYER_KEYBOARD_COUNTER_RANGE;
  const events = packets.flatMap((packet) => packet.events).sort((a, b) => after(a.counter) - after(b.counter));
  const { continuation: _continuation, ...placement } = first;
  return { ...placement, events };
}
