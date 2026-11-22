import { PLAYER_KEYBOARD_COUNTER_RANGE, PLAYER_KEYBOARD_OCTAVE_SEMITONES } from './player_keyboard_constants.js';
import {
  playerKeyboardEventInstrument,
  playerKeyboardEventOctave,
  playerKeyboardEventVibrato,
  type PlayerKeyboardEvent,
  type PlayerKeyboardPacket,
} from './player_keyboard_protocol.js';

/** A received note change with the instrument the stream had at that point. */
export interface PlayerKeyboardNote {
  counter: number;
  pitch: number;
  down: boolean;
  time: number;
  instrument: number;
  /** Semitones the octave shift in effect at the note-on adds. */
  transpose: number;
}

/**
 * A received vibrato change: a toggle event, or the header state taken over
 * after a gap or at the start of the stream.
 */
export interface PlayerKeyboardVibratoChange {
  vibrato: boolean;
  /** Sender time in milliseconds (0 to apply at once). */
  time: number;
}

/** Counts for tests and browser diagnostics. */
export interface PlayerKeyboardReceiverStats {
  accepted: number;
  duplicates: number;
  missing: number;
}

/**
 * One member's keyboard stream: keeps events in counter order, drops the
 * repeated copies, counts events lost in both of their frames and resolves
 * instrument switches, octave shifts and vibrato toggles in stream order.
 */
export class PlayerKeyboardReceiver {
  private last: number | null = null;
  private instrument = 0;
  private vibrato = false;
  private octave = false;
  private readonly vibratoChanges: PlayerKeyboardVibratoChange[] = [];
  readonly stats: PlayerKeyboardReceiverStats = { accepted: 0, duplicates: 0, missing: 0 };

  /**
   * Accepts the new events of an entry. The first entry seen only sets the
   * baseline (its notes may be old, for example from the relay's latest full
   * frame to a joiner), keeping its instrument, octave and vibrato. An entry
   * without events states the current ones, recovering lost toggles.
   *
   * @param packet Decoded keyboard entry.
   * @returns New note changes in order.
   */
  accept(packet: PlayerKeyboardPacket): PlayerKeyboardNote[] {
    if (this.last === null) return this.baseline(packet);
    if (packet.events.length === 0) this.headerTake(packet, 0);
    const notes: PlayerKeyboardNote[] = [];
    packet.events.forEach((event, index) => {
      const distance = this.distance(event);
      if (distance === 0) return;
      if (distance > 1 && index === 0) this.headerTake(packet, event.time);
      this.stats.missing += distance - 1;
      this.stats.accepted += 1;
      this.last = event.counter;
      this.apply(event, notes);
    });
    return notes;
  }

  /**
   * Returns the instrument after the accepted events.
   *
   * @returns Slot.
   */
  getInstrument(): number {
    return this.instrument;
  }

  /**
   * Returns the vibrato changes found since the last call, in stream order.
   *
   * @returns Changes.
   */
  takeVibratoChanges(): PlayerKeyboardVibratoChange[] {
    return this.vibratoChanges.splice(0);
  }

  /**
   * Takes over the header state (the stream start, or events lost before the
   * entry), reporting a vibrato change when it differs.
   *
   * @param packet Entry.
   * @param time When the state holds (0 at once).
   */
  private headerTake(packet: PlayerKeyboardPacket, time: number): void {
    this.instrument = packet.instrument;
    this.octave = packet.octave ?? false;
    this.vibratoTake(packet.vibrato ?? false, time);
  }

  /**
   * Sets the vibrato state, reporting a change.
   *
   * @param vibrato New state.
   * @param time Sender time of the change.
   */
  private vibratoTake(vibrato: boolean, time: number): void {
    if (vibrato !== this.vibrato) this.vibratoChanges.push({ vibrato, time });
    this.vibrato = vibrato;
  }

  /**
   * Starts the stream from a first entry.
   *
   * @param packet First entry.
   * @returns No notes.
   */
  private baseline(packet: PlayerKeyboardPacket): PlayerKeyboardNote[] {
    this.headerTake(packet, 0);
    packet.events.forEach((event) => this.apply(event, []));
    this.last =
      (packet.base + packet.events.length - 1 + PLAYER_KEYBOARD_COUNTER_RANGE) % PLAYER_KEYBOARD_COUNTER_RANGE;
    return [];
  }

  /**
   * Returns how far an event is past the last accepted one (0 for a repeat or
   * an older event).
   *
   * @param event Event.
   * @returns Distance.
   */
  private distance(event: PlayerKeyboardEvent): number {
    const distance = (event.counter - (this.last ?? 0) + PLAYER_KEYBOARD_COUNTER_RANGE) % PLAYER_KEYBOARD_COUNTER_RANGE;
    if (distance !== 0 && distance < PLAYER_KEYBOARD_COUNTER_RANGE / 2) return distance;
    this.stats.duplicates += 1;
    return 0;
  }

  /**
   * Applies an instrument switch, an octave shift or a vibrato toggle, or
   * collects a note with the instrument and octave in effect.
   *
   * @param event Accepted event.
   * @param notes Destination.
   */
  private apply(event: PlayerKeyboardEvent, notes: PlayerKeyboardNote[]): void {
    const instrument = playerKeyboardEventInstrument(event);
    const vibrato = playerKeyboardEventVibrato(event);
    const octave = playerKeyboardEventOctave(event);
    if (instrument !== null) this.instrument = instrument;
    else if (vibrato !== null) this.vibratoTake(vibrato, event.time);
    else if (octave !== null) this.octave = octave;
    else
      notes.push({
        counter: event.counter,
        pitch: event.value,
        down: event.down,
        time: event.time,
        instrument: this.instrument,
        transpose: this.octave ? PLAYER_KEYBOARD_OCTAVE_SEMITONES : 0,
      });
  }
}
