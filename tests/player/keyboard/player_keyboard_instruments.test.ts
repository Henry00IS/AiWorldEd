import { describe, expect, it } from 'vitest';
import {
  PLAYER_KEYBOARD_INSTRUMENTS,
  playerKeyboardInstrumentIsPlayable,
  playerKeyboardInstrumentStep,
} from '@/player/keyboard/player_keyboard_instruments.js';

describe('player keyboard instruments', () => {
  it('has eight slots: three waves, the organ, the piano, the choir, the looped strings, then strings layered with the piano', () => {
    expect(PLAYER_KEYBOARD_INSTRUMENTS.map((instrument) => instrument.label).slice(0, 7)).toEqual([
      'Sine',
      'Square',
      'Triangle',
      'Organ',
      'Piano',
      'Choir',
      'Strings',
    ]);
    expect(PLAYER_KEYBOARD_INSTRUMENTS[4]).toMatchObject({ rootPitch: 60, sustain: 1 });
    expect(PLAYER_KEYBOARD_INSTRUMENTS[4]).not.toHaveProperty('loop');
    const choir = PLAYER_KEYBOARD_INSTRUMENTS[5];
    expect(choir).toMatchObject({ choir: true, sustain: 1 });
    expect(choir?.attack).toBeGreaterThan(0.08);
    expect(PLAYER_KEYBOARD_INSTRUMENTS[6]).toMatchObject({ rootPitch: 60, sustain: 1, loop: { start: 0 } });
    expect(PLAYER_KEYBOARD_INSTRUMENTS[7]).toMatchObject({ layers: [6, 4] });
    expect(PLAYER_KEYBOARD_INSTRUMENTS[7]?.level).toBeLessThan(1);
    expect(PLAYER_KEYBOARD_INSTRUMENTS).toHaveLength(8);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((slot) => playerKeyboardInstrumentIsPlayable(slot))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('steps through the slots, wrapping both ways', () => {
    expect(playerKeyboardInstrumentStep(0, 1)).toBe(1);
    expect(playerKeyboardInstrumentStep(2, 1)).toBe(3);
    expect(playerKeyboardInstrumentStep(3, 1)).toBe(4);
    expect(playerKeyboardInstrumentStep(4, 1)).toBe(5);
    expect(playerKeyboardInstrumentStep(5, 1)).toBe(6);
    expect(playerKeyboardInstrumentStep(6, 1)).toBe(7);
    expect(playerKeyboardInstrumentStep(7, 1)).toBe(0);
    expect(playerKeyboardInstrumentStep(0, -1)).toBe(7);
  });
});
