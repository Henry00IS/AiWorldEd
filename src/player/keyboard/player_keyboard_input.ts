import type { ManagerInput } from '@/input/manager_input.js';
import { PLAYER_KEYBOARD_LOWEST_PITCH } from './player_keyboard_constants.js';

/**
 * Physical typing keys, in chromatic order from C4 through G6 (FL Studio note
 * names: KeyQ is C5, middle C).
 */
export const PLAYER_KEYBOARD_CODES = [
  'KeyZ',
  'KeyS',
  'KeyX',
  'KeyD',
  'KeyC',
  'KeyV',
  'KeyG',
  'KeyB',
  'KeyH',
  'KeyN',
  'KeyJ',
  'KeyM',
  'KeyQ',
  'Digit2',
  'KeyW',
  'Digit3',
  'KeyE',
  'KeyR',
  'Digit5',
  'KeyT',
  'Digit6',
  'KeyY',
  'Digit7',
  'KeyU',
  'KeyI',
  'Digit9',
  'KeyO',
  'Digit0',
  'KeyP',
  'BracketLeft',
  'Equal',
  'BracketRight',
] as const;

/**
 * Keys after M that play C5 to E5 again, like FL Studio's typing piano (on a
 * German layout , L . Ö -).
 */
const PLAYER_KEYBOARD_DUPLICATE_CODES = ['Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'] as const;

/** Offset of the first duplicate key (C5) from the lowest pitch. */
const PLAYER_KEYBOARD_DUPLICATE_OFFSET = 12;

/** Every playing key with its pitch offset from the lowest pitch. */
const PLAYER_KEYBOARD_KEYS: readonly (readonly [string, number])[] = [
  ...PLAYER_KEYBOARD_CODES.map((code, index) => [code, index] as const),
  ...PLAYER_KEYBOARD_DUPLICATE_CODES.map((code, index) => [code, PLAYER_KEYBOARD_DUPLICATE_OFFSET + index] as const),
];

/**
 * Samples physical keys without browser key-repeat or layout-dependent keyup
 * events. Notes are tracked per pitch, not per key: pressing a duplicate key of
 * a sounding note restarts it (off, then on), and the first release of either
 * key ends it.
 */
export class PlayerKeyboardInput {
  private readonly held = new Set<string>();
  private readonly sounding = new Set<number>();

  /**
   * Reports note changes since the previous sample.
   *
   * @param input Physical keyboard state.
   * @param change Receives a pitch and whether it was pressed.
   */
  sample(input: ManagerInput, change: (pitch: number, down: boolean) => void): void {
    PLAYER_KEYBOARD_KEYS.forEach(([code, offset]) => {
      const down = input.isPhysicalKeyDown(code);
      if (down === this.held.has(code)) return;
      if (down) this.held.add(code);
      else this.held.delete(code);
      this.toggle(PLAYER_KEYBOARD_LOWEST_PITCH + offset, down, change);
    });
  }

  /** Forgets keys and notes when the keyboard is put away. */
  reset(): void {
    this.held.clear();
    this.sounding.clear();
  }

  /**
   * Applies one key press or release to its note: a press restarts a sounding
   * note, a release ends it, and a release of an already ended note is
   * ignored.
   *
   * @param pitch MIDI pitch of the key.
   * @param down Pressed or released.
   * @param change Receives a pitch and whether it was pressed.
   */
  private toggle(pitch: number, down: boolean, change: (pitch: number, down: boolean) => void): void {
    const sounding = this.sounding.has(pitch);
    if (sounding) change(pitch, false);
    if (down) change(pitch, true);
    if (down) this.sounding.add(pitch);
    else this.sounding.delete(pitch);
  }
}
