import {
  playerKeyboardEventInstrument,
  playerKeyboardEventIsNote,
  playerKeyboardEventOctave,
  playerKeyboardEventVibrato,
  type PlayerKeyboardEvent,
} from './player_keyboard_protocol.js';

/** An unsent event the overflow rules look at. */
export type PlayerKeyboardOverflowEvent = Pick<PlayerKeyboardEvent, 'value' | 'down' | 'time'>;

/**
 * Lists the droppable notes of unsent events, oldest first: each note-on with
 * its note-off when that is unsent too (receivers then never hear either).
 * Note-offs of notes whose note-on already went out are never listed.
 *
 * @param unsent Unsent events, oldest first.
 * @returns Note-on, or note-on and note-off, per droppable note.
 */
export function playerKeyboardOverflowNotes<Event extends PlayerKeyboardOverflowEvent>(
  unsent: readonly Event[],
): Event[][] {
  const notes: Event[][] = [];
  unsent.forEach((event, index) => {
    if (!event.down || !playerKeyboardEventIsNote(event)) return;
    const off = unsent.slice(index + 1).find((later) => !later.down && later.value === event.value);
    notes.push(off ? [event, off] : [event]);
  });
  return notes;
}

/**
 * Picks the unsent events to drop when more are pending than fit one frame, so
 * the newest playing goes out on time instead of a backlog: instrument
 * switches, octave shifts and vibrato toggles each collapse into the latest
 * one, then the oldest droppable notes go until the rest fits (note-offs of
 * heard notes and the latest switch and toggle always stay).
 *
 * @param unsent Unsent events, oldest first.
 * @param room Events that fit.
 * @returns Dropped notes (each a note-on, or a note-on and its note-off) and
 *   dropped switches and toggles.
 */
export function playerKeyboardOverflowDrops<Event extends PlayerKeyboardOverflowEvent>(
  unsent: readonly Event[],
  room: number,
): { notes: Event[][]; switches: Event[] } {
  const switches = [
    ...unsent.filter((event) => playerKeyboardEventInstrument(event) !== null).slice(0, -1),
    ...unsent.filter((event) => playerKeyboardEventVibrato(event) !== null).slice(0, -1),
    ...unsent.filter((event) => playerKeyboardEventOctave(event) !== null).slice(0, -1),
  ];
  const notes: Event[][] = [];
  let left = unsent.length - switches.length;
  for (const note of playerKeyboardOverflowNotes(unsent)) {
    if (left <= room) break;
    notes.push(note);
    left -= note.length;
  }
  return { notes, switches };
}
