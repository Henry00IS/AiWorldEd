import {
  PLAYER_KEYBOARD_AGE_MAXIMUM_MS,
  PLAYER_KEYBOARD_EVENTS_PER_ENTRY,
  PLAYER_KEYBOARD_SENDS_PER_EVENT,
} from './player_keyboard_constants.js';
import {
  playerKeyboardEventInstrument,
  playerKeyboardEventOctave,
  playerKeyboardEventVibrato,
  type PlayerKeyboardEvent,
} from './player_keyboard_protocol.js';
import { playerKeyboardOverflowDrops, playerKeyboardOverflowNotes } from './player_keyboard_sender_overflow.js';

/**
 * Outgoing event: numbered when it first goes into a window, with the number of
 * frames it has ridden in.
 */
interface PlayerKeyboardQueued extends Omit<PlayerKeyboardEvent, 'counter'> {
  counter: number | null;
  sends: number;
  /** Instrument in effect before this event. */
  instrumentBefore: number;
  /** Vibrato state before this event. */
  vibratoBefore: boolean;
  /** Octave shift before this event. */
  octaveBefore: boolean;
}

/**
 * Empty frames with the all-released bit owed after the last event, so a
 * receiver that lost both copies of a note-off still learns no key is held.
 */
const PLAYER_KEYBOARD_RELEASED_FRAMES = 2;

/** Contiguous outgoing event run for one entry. */
export interface PlayerKeyboardWindow {
  base: number;
  /** Instrument in effect before the first event. */
  instrument: number;
  /** Vibrato state before the first event. */
  vibrato: boolean;
  /** Octave shift before the first event. */
  octave: boolean;
  /** No key is held at the frame tick. */
  released: boolean;
  events: PlayerKeyboardEvent[];
  start: number;
}

/**
 * Keeps local note events until they rode in two frames. It never builds a
 * backlog: when more are pending than fit a frame it skips ahead, dropping the
 * oldest notes (and notes too old for a frame) that nobody heard yet, so the
 * newest playing goes out with its real timing, while every note-off of a heard
 * note still goes out.
 */
export class PlayerKeyboardSender {
  private readonly queue: PlayerKeyboardQueued[] = [];
  private readonly silenced = new Set<number>();
  private counter = 0;
  private instrument = 0;
  private vibrato = false;
  private octave = false;
  private releasedOwed = 0;

  /**
   * Queues one event (a note change, an octave shift, a vibrato toggle or an
   * instrument switch); the note-off of a dropped note-on is dropped too.
   *
   * @param value MIDI pitch, an octave or vibrato code, or
   *   PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST + slot.
   * @param down Pressed or released (always down for a toggle or a switch).
   * @param time Local time in milliseconds.
   */
  record(value: number, down: boolean, time: number): void {
    if (!down && this.silenced.delete(value)) return;
    const before = { instrumentBefore: this.instrument, vibratoBefore: this.vibrato, octaveBefore: this.octave };
    this.queue.push({ counter: null, value, down, time, sends: 0, ...before });
    this.instrument = playerKeyboardEventInstrument({ value, down }) ?? this.instrument;
    this.vibrato = playerKeyboardEventVibrato({ value, down }) ?? this.vibrato;
    this.octave = playerKeyboardEventOctave({ value, down }) ?? this.octave;
    this.releasedOwed = PLAYER_KEYBOARD_RELEASED_FRAMES;
  }

  /**
   * Returns the octave shift after every queued event.
   *
   * @returns True while an octave up.
   */
  getOctave(): boolean {
    return this.octave;
  }

  /**
   * Returns the vibrato state after every queued event.
   *
   * @returns True while on.
   */
  getVibrato(): boolean {
    return this.vibrato;
  }

  /**
   * Returns the instrument after every queued event.
   *
   * @returns Slot.
   */
  getInstrument(): number {
    return this.instrument;
  }

  /**
   * Tells whether more events are owed than one entry holds, so a frame should
   * carry a continuation entry.
   *
   * @param now Frame time in milliseconds.
   * @returns True while overflowing.
   */
  isOverflowing(now: number): boolean {
    this.prune(now);
    return this.queue.length > PLAYER_KEYBOARD_EVENTS_PER_ENTRY;
  }

  /**
   * Picks the unsent events plus older single-sent copies, numbering the new
   * ones, after skipping ahead past what does not fit.
   *
   * @param now Frame time in milliseconds.
   * @param entries Entries the frame carries (2 with a continuation entry).
   * @param released No key is held at the frame tick.
   * @returns Event window for the entries.
   */
  window(now: number, entries = 1, released = false): PlayerKeyboardWindow {
    const room = entries * PLAYER_KEYBOARD_EVENTS_PER_ENTRY;
    this.prune(now);
    this.skipAhead(now, room);
    const unsent = this.queue.findIndex((event) => event.sends === 0);
    const first = unsent < 0 ? this.queue.length : unsent;
    const end = Math.min(this.queue.length, first + room);
    const start = Math.max(0, end - room);
    const queued = this.queue.slice(start, end);
    const events = queued.map((event) => ({ ...event, counter: this.numbered(event) }));
    return {
      base: events[0]?.counter ?? this.counter,
      instrument: queued[0]?.instrumentBefore ?? this.instrument,
      vibrato: queued[0]?.vibratoBefore ?? this.vibrato,
      octave: queued[0]?.octaveBefore ?? this.octave,
      released,
      events: events.map(({ counter, value, down, time }) => ({ counter, value, down, time })),
      start,
    };
  }

  /**
   * Marks a window as delivered to the link; an empty one with the all-released
   * bit pays off one owed released frame.
   *
   * @param window Window returned for the frame that went out.
   */
  sent(window: PlayerKeyboardWindow): void {
    this.queue.splice(0, window.start);
    this.queue.slice(0, window.events.length).forEach((event) => (event.sends += 1));
    if (window.released && window.events.length === 0) this.releasedOwed = Math.max(0, this.releasedOwed - 1);
  }

  /**
   * Tells whether an event still needs a first or second frame, or an empty
   * all-released frame is owed after the last event.
   *
   * @param now Current time in milliseconds.
   * @param released No key is held now.
   * @returns True while owing.
   */
  isOwing(now: number, released = false): boolean {
    return (
      (released && this.releasedOwed > 0) ||
      this.queue.some(
        (event) =>
          event.sends === 0 ||
          (event.sends < PLAYER_KEYBOARD_SENDS_PER_EVENT && now - event.time <= PLAYER_KEYBOARD_AGE_MAXIMUM_MS),
      )
    );
  }

  /**
   * Drops queued events without resetting the counter, so receivers never see
   * an old counter again.
   */
  clear(): void {
    this.queue.length = 0;
    this.silenced.clear();
    this.releasedOwed = 0;
  }

  /**
   * Returns an event's counter, giving it the next one on its first window.
   *
   * @param event Queued event.
   * @returns Counter.
   */
  private numbered(event: PlayerKeyboardQueued): number {
    if (event.counter !== null) return event.counter;
    event.counter = this.counter;
    this.counter = (this.counter + 1) & 255;
    return event.counter;
  }

  /**
   * Drops unsent notes that are too old for a frame, then the oldest unsent
   * notes and older switches, octave shifts and vibrato toggles while more are
   * pending than the frame holds.
   *
   * @param now Frame time in milliseconds.
   * @param room Events the frame holds.
   */
  private skipAhead(now: number, room: number): void {
    const unsent = this.queue.filter((event) => event.sends === 0);
    const stale = playerKeyboardOverflowNotes(unsent).filter(
      ([on]) => on && now - on.time > PLAYER_KEYBOARD_AGE_MAXIMUM_MS,
    );
    this.notesDrop(stale);
    const fresh = this.queue.filter((event) => event.sends === 0);
    if (fresh.length <= room) return;
    const { notes, switches } = playerKeyboardOverflowDrops(fresh, room);
    this.notesDrop(notes);
    this.eventsDrop(new Set(switches));
  }

  /**
   * Drops notes, remembering held ones so their later note-off is dropped too.
   *
   * @param notes Note-on, or note-on and note-off, per note.
   */
  private notesDrop(notes: PlayerKeyboardQueued[][]): void {
    notes.forEach((note) => {
      if (note.length === 1 && note[0]) this.silenced.add(note[0].value);
    });
    this.eventsDrop(new Set(notes.flat()));
  }

  /**
   * Removes events from the queue.
   *
   * @param drops Events to remove.
   */
  private eventsDrop(drops: ReadonlySet<PlayerKeyboardQueued>): void {
    const kept = this.queue.filter((event) => !drops.has(event));
    this.queue.splice(0, this.queue.length, ...kept);
  }

  /**
   * Removes fully sent events and expired redundant copies.
   *
   * @param now Current time in milliseconds.
   */
  private prune(now: number): void {
    while (
      this.queue[0] &&
      (this.queue[0].sends >= PLAYER_KEYBOARD_SENDS_PER_EVENT ||
        (this.queue[0].sends > 0 && now - this.queue[0].time > PLAYER_KEYBOARD_AGE_MAXIMUM_MS))
    )
      this.queue.shift();
  }
}
