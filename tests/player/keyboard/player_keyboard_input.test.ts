import { describe, expect, it, vi } from 'vitest';
import type { ManagerInput } from '@/input/manager_input.js';
import { PlayerKeyboardInput } from '@/player/keyboard/player_keyboard_input.js';
import { PLAYER_KEYBOARD_INSTRUMENTS } from '@/player/keyboard/player_keyboard_instruments.js';

/**
 * Builds physical input backed by a mutable set of event.code values.
 *
 * @param keys Physical keys currently down.
 * @returns Input state.
 */
function inputBuild(keys: Set<string>): ManagerInput {
  return { isPhysicalKeyDown: (code: string) => keys.has(code) } as unknown as ManagerInput;
}

const duplicatePairs = [
  ['KeyQ', 'Comma', 60],
  ['Digit2', 'KeyL', 61],
  ['KeyW', 'Period', 62],
  ['Digit3', 'Semicolon', 63],
  ['KeyE', 'Slash', 64],
] as const;

describe('PlayerKeyboardInput', () => {
  it.each(duplicatePairs)('maps %s and %s to one note, %i, ignoring repeats', (original, duplicate, pitch) => {
    const keyboard = new PlayerKeyboardInput();
    const keys = new Set<string>([duplicate]);
    const input = inputBuild(keys);
    const change = vi.fn();
    keyboard.sample(input, change);
    keyboard.sample(input, change);
    keys.delete(duplicate);
    keyboard.sample(input, change);
    keys.add(original);
    keyboard.sample(input, change);
    expect(change.mock.calls).toEqual([
      [pitch, true],
      [pitch, false],
      [pitch, true],
    ]);
  });

  it.each([false, true])(
    'restarts a note on its duplicate and releases on the first key-up (duplicate first: %s)',
    (duplicateFirst) => {
      const keyboard = new PlayerKeyboardInput();
      const keys = new Set<string>(['KeyQ']);
      const input = inputBuild(keys);
      const change = vi.fn();
      keyboard.sample(input, change);
      keys.add('Comma');
      keyboard.sample(input, change);
      keys.delete(duplicateFirst ? 'Comma' : 'KeyQ');
      keyboard.sample(input, change);
      keyboard.sample(input, change);
      keys.clear();
      keyboard.sample(input, change);
      expect(change.mock.calls).toEqual([
        [60, true],
        [60, false],
        [60, true],
        [60, false],
      ]);
    },
  );

  it('plays middle C on KeyQ like FL Studio, the recorded pitch of every sample slot, and the octave below on KeyZ', () => {
    const keyboard = new PlayerKeyboardInput();
    const change = vi.fn();
    keyboard.sample(inputBuild(new Set(['KeyZ', 'KeyQ'])), change);
    const roots = PLAYER_KEYBOARD_INSTRUMENTS.flatMap((instrument) =>
      'rootPitch' in instrument ? [instrument.rootPitch] : [],
    );
    expect(change.mock.calls).toEqual([
      [48, true],
      [60, true],
    ]);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.every((root) => root === 60)).toBe(true);
  });

  it('forgets physical keys and note state on reset', () => {
    const keyboard = new PlayerKeyboardInput();
    const keys = new Set<string>(['Comma']);
    const input = inputBuild(keys);
    const change = vi.fn();
    keyboard.sample(input, change);
    keyboard.reset();
    keyboard.sample(input, change);
    expect(change.mock.calls).toEqual([
      [60, true],
      [60, true],
    ]);
  });
});
