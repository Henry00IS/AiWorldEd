import type { SettingsStorage } from '@/settings/storage/settings_storage.js';
import { settingsStorageDefault } from '@/settings/storage/settings_storage.js';
import { playerKeyboardInstrumentIsPlayable } from './player_keyboard_instruments.js';

/** Storage key for the keyboard toy preferences JSON. */
export const PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY = 'aiworlded.settings.keyboardToy';

/** Persists the keyboard toy's instrument slot between placements and sessions. */
export class PlayerKeyboardSettings {
  /**
   * Creates the preferences over a storage backend.
   *
   * @param storage Storage backend (localStorage when available, otherwise
   *   memory).
   */
  constructor(private readonly storage: SettingsStorage = settingsStorageDefault()) {}

  /**
   * Returns the remembered instrument slot, or the first slot when none is
   * stored or the stored one cannot play.
   *
   * @returns Slot.
   */
  getInstrument(): number {
    try {
      const parsed = JSON.parse(this.storage.getItem(PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY) ?? '{}') as {
        instrument?: unknown;
      };
      const slot = parsed.instrument;
      return typeof slot === 'number' && Number.isInteger(slot) && playerKeyboardInstrumentIsPlayable(slot) ? slot : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Remembers the instrument slot.
   *
   * @param slot Slot.
   */
  setInstrument(slot: number): void {
    this.storage.setItem(PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY, JSON.stringify({ instrument: slot }));
  }
}

/** Shared keyboard toy preferences. */
export const playerKeyboardSettings = new PlayerKeyboardSettings();
