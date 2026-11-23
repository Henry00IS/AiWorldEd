import { describe, expect, it } from 'vitest';
import {
  playerKeyboardOverflowDrops,
  playerKeyboardOverflowNotes,
} from '@/player/keyboard/player_keyboard_sender_overflow.js';

/**
 * Builds an unsent event.
 *
 * @param value Pitch or switch value.
 * @param down Pressed or released.
 * @param time Time in milliseconds.
 * @returns Event.
 */
function event(value: number, down: boolean, time: number): { value: number; down: boolean; time: number } {
  return { value, down, time };
}

describe('player keyboard sender overflow', () => {
  it('pairs each note-on with its own later note-off and never lists a lone note-off', () => {
    const unsent = [
      event(60, false, 0),
      event(61, true, 1),
      event(61, false, 2),
      event(61, true, 3),
      event(122, true, 4),
    ];
    expect(playerKeyboardOverflowNotes(unsent)).toEqual([[unsent[1], unsent[2]], [unsent[3]]]);
  });

  it('drops the oldest notes and older switches until the rest fits, keeping heard releases', () => {
    const unsent = [
      event(60, false, 0),
      event(121, true, 1),
      event(61, true, 2),
      event(61, false, 3),
      event(62, true, 4),
      event(122, true, 5),
      event(63, true, 6),
    ];
    const { notes, switches } = playerKeyboardOverflowDrops(unsent, 3);
    expect(switches).toEqual([unsent[1]]);
    expect(notes).toEqual([[unsent[2], unsent[3]], [unsent[4]]]);
  });
});
