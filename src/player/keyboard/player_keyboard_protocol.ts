import type { ToyEntry } from '@/collaboration/shared/toy_frame.js';
import {
  PLAYER_KEYBOARD_AGE_MAXIMUM_MS,
  PLAYER_KEYBOARD_AGE_STEP_MS,
  PLAYER_KEYBOARD_EVENTS_PER_ENTRY,
  PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST,
  PLAYER_KEYBOARD_OCTAVE_EVENT_DOWN,
  PLAYER_KEYBOARD_OCTAVE_EVENT_UP,
  PLAYER_KEYBOARD_PAYLOAD_HEADER_BYTES,
  PLAYER_KEYBOARD_TOY_ID,
  PLAYER_KEYBOARD_VIBRATO_EVENT_OFF,
  PLAYER_KEYBOARD_VIBRATO_EVENT_ON,
} from './player_keyboard_constants.js';

/** Client-defined toy type of the keyboard (opaque to the relay). */
export const TOY_TYPE_KEYBOARD = 4;
/**
 * Bit 3 of the instrument byte: more events for the same keyboard, not a toy
 * type.
 */
const PLAYER_KEYBOARD_CONTINUATION = 8;
/** Bit 4 of the instrument byte: the vibrato is on before the first event. */
const PLAYER_KEYBOARD_VIBRATO = 16;
/** Bit 5 of the instrument byte: no key was held at the frame tick. */
const PLAYER_KEYBOARD_RELEASED = 32;
/**
 * Bit 6 of the instrument byte: the keys are an octave up before the first
 * event.
 */
const PLAYER_KEYBOARD_OCTAVE = 64;
/** Largest valid instrument byte (slot and the four flag bits). */
const PLAYER_KEYBOARD_HEADER_MAXIMUM = 127;

/**
 * One numbered event: a note going down or up (value is the key's MIDI pitch in
 * the lowest octave), an octave shift (down, PLAYER_KEYBOARD_OCTAVE_EVENT_UP or
 * _DOWN), a vibrato toggle (down, PLAYER_KEYBOARD_VIBRATO_EVENT_ON or _OFF) or
 * an instrument switch (down, value PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST +
 * slot).
 */
export interface PlayerKeyboardEvent {
  counter: number;
  value: number;
  down: boolean;
  /**
   * Sender time in milliseconds (receivers: the sender's tick time minus the
   * age).
   */
  time: number;
}

/**
 * One keyboard entry: placement, the instrument before its first event, and a
 * contiguous event run.
 */
export interface PlayerKeyboardPacket {
  position: [number, number, number];
  yaw: number;
  instrument: number;
  /** More events of the same keyboard in another entry id. */
  continuation?: boolean;
  /** Vibrato on before the first event. */
  vibrato?: boolean;
  /** Keys an octave up before the first event. */
  octave?: boolean;
  /** No key was held at the frame tick. */
  released?: boolean;
  base: number;
  events: PlayerKeyboardEvent[];
}

/**
 * Tells whether an event switches the instrument.
 *
 * @param event Event.
 * @returns Slot, or null for a note.
 */
export function playerKeyboardEventInstrument(event: Pick<PlayerKeyboardEvent, 'value' | 'down'>): number | null {
  return event.down && event.value >= PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST
    ? event.value - PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST
    : null;
}

/**
 * Tells whether an event toggles the vibrato.
 *
 * @param event Event.
 * @returns New vibrato state, or null for any other event.
 */
export function playerKeyboardEventVibrato(event: Pick<PlayerKeyboardEvent, 'value' | 'down'>): boolean | null {
  if (!event.down) return null;
  if (event.value === PLAYER_KEYBOARD_VIBRATO_EVENT_ON) return true;
  return event.value === PLAYER_KEYBOARD_VIBRATO_EVENT_OFF ? false : null;
}

/**
 * Tells whether an event shifts the octave.
 *
 * @param event Event.
 * @returns True for up, false for back down, or null for any other event.
 */
export function playerKeyboardEventOctave(event: Pick<PlayerKeyboardEvent, 'value' | 'down'>): boolean | null {
  if (!event.down) return null;
  if (event.value === PLAYER_KEYBOARD_OCTAVE_EVENT_UP) return true;
  return event.value === PLAYER_KEYBOARD_OCTAVE_EVENT_DOWN ? false : null;
}

/**
 * Tells whether an event plays a note (not an octave shift, a vibrato toggle or
 * a switch).
 *
 * @param event Event.
 * @returns True for a note change.
 */
export function playerKeyboardEventIsNote(event: Pick<PlayerKeyboardEvent, 'value'>): boolean {
  return event.value < PLAYER_KEYBOARD_OCTAVE_EVENT_UP;
}

/**
 * Writes the instrument byte: the slot in bits 0-2, then the continuation,
 * vibrato, all-released and octave flags.
 *
 * @param packet Packet.
 * @returns Byte.
 */
function playerKeyboardHeaderWrite(packet: PlayerKeyboardPacket): number {
  const flags = [
    [packet.continuation, PLAYER_KEYBOARD_CONTINUATION],
    [packet.vibrato, PLAYER_KEYBOARD_VIBRATO],
    [packet.released, PLAYER_KEYBOARD_RELEASED],
    [packet.octave, PLAYER_KEYBOARD_OCTAVE],
  ] as const;
  return flags.reduce((byte, [set, bit]) => (set ? byte | bit : byte), packet.instrument & 7);
}

/**
 * Reads the instrument byte, leaving out flags that are not set.
 *
 * @param byte Instrument byte.
 * @returns Slot and the set flags.
 */
function playerKeyboardHeaderRead(
  byte: number,
): Pick<PlayerKeyboardPacket, 'instrument' | 'continuation' | 'vibrato' | 'released' | 'octave'> {
  return {
    instrument: byte & 7,
    ...((byte & PLAYER_KEYBOARD_CONTINUATION) !== 0 ? { continuation: true } : {}),
    ...((byte & PLAYER_KEYBOARD_VIBRATO) !== 0 ? { vibrato: true } : {}),
    ...((byte & PLAYER_KEYBOARD_OCTAVE) !== 0 ? { octave: true } : {}),
    ...((byte & PLAYER_KEYBOARD_RELEASED) !== 0 ? { released: true } : {}),
  };
}

/**
 * Builds the keyboard's toy entry: [base counter, yaw, instrument] then 2 bytes
 * per event (down bit with value, age before the frame tick in 2 ms steps).
 *
 * @param packet Placement and events (at most PLAYER_KEYBOARD_EVENTS_PER_ENTRY
 *   are written).
 * @param time Time of the frame tick in milliseconds.
 * @returns Toy entry.
 */
export function playerKeyboardEncode(packet: PlayerKeyboardPacket, time: number): ToyEntry {
  const events = packet.events.slice(0, PLAYER_KEYBOARD_EVENTS_PER_ENTRY);
  const payload = new Uint8Array(PLAYER_KEYBOARD_PAYLOAD_HEADER_BYTES + events.length * 2);
  const turn = (((packet.yaw / (Math.PI * 2)) % 1) + 1) % 1;
  payload.set([packet.base & 255, Math.round(turn * 256) & 255, playerKeyboardHeaderWrite(packet)]);
  events.forEach((event, index) => {
    const age = Math.max(0, Math.min(PLAYER_KEYBOARD_AGE_MAXIMUM_MS, time - event.time));
    payload[3 + index * 2] = (event.value & 127) | (event.down ? 128 : 0);
    payload[4 + index * 2] = Math.round(age / PLAYER_KEYBOARD_AGE_STEP_MS);
  });
  return { type: TOY_TYPE_KEYBOARD, id: PLAYER_KEYBOARD_TOY_ID, flags: 0, position: [...packet.position], payload };
}

/**
 * Reads a keyboard entry.
 *
 * @param entry Toy entry of type TOY_TYPE_KEYBOARD.
 * @param time Local time of the frame tick in milliseconds.
 * @returns Packet, or null when malformed.
 */
export function playerKeyboardDecode(entry: ToyEntry, time: number): PlayerKeyboardPacket | null {
  const bytes = entry.payload;
  const count = (bytes.length - PLAYER_KEYBOARD_PAYLOAD_HEADER_BYTES) / 2;
  if (
    entry.type !== TOY_TYPE_KEYBOARD ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > PLAYER_KEYBOARD_EVENTS_PER_ENTRY
  )
    return null;
  if ((bytes[2] ?? 0) > PLAYER_KEYBOARD_HEADER_MAXIMUM) return null;
  const base = bytes[0] ?? 0;
  const events = Array.from({ length: count }, (_, index) => {
    const value = bytes[3 + index * 2] ?? 0;
    const age = (bytes[4 + index * 2] ?? 0) * PLAYER_KEYBOARD_AGE_STEP_MS;
    return { counter: (base + index) & 255, value: value & 127, down: (value & 128) !== 0, time: time - age };
  });
  const yaw = ((bytes[1] ?? 0) / 256) * Math.PI * 2;
  return { position: [...entry.position], yaw, ...playerKeyboardHeaderRead(bytes[2] ?? 0), base, events };
}

/**
 * Lists the keyboard entries of a decoded toy frame (a first entry and, while
 * overflowing, its continuation).
 *
 * @param entries Frame entries.
 * @returns Keyboard entries.
 */
export function playerKeyboardEntriesFind(entries: readonly ToyEntry[]): ToyEntry[] {
  return entries.filter((entry) => entry.type === TOY_TYPE_KEYBOARD);
}
