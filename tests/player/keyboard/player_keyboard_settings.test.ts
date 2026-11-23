import { describe, expect, it } from 'vitest';
import {
  PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY,
  PlayerKeyboardSettings,
} from '@/player/keyboard/player_keyboard_settings.js';
import { PLAYER_KEYBOARD_INSTRUMENTS } from '@/player/keyboard/player_keyboard_instruments.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';

describe('PlayerKeyboardSettings', () => {
  it('starts on the first slot and keeps a picked slot across instances on the same storage', () => {
    const storage = new MemorySettingsStorage();
    expect(new PlayerKeyboardSettings(storage).getInstrument()).toBe(0);
    const last = PLAYER_KEYBOARD_INSTRUMENTS.length - 1;
    new PlayerKeyboardSettings(storage).setInstrument(last);
    expect(new PlayerKeyboardSettings(storage).getInstrument()).toBe(last);
    expect(PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY.startsWith('aiworlded.settings.')).toBe(true);
  });

  it('falls back to the first slot for a broken, out of range or non-integer stored slot', () => {
    const storage = new MemorySettingsStorage();
    const settings = new PlayerKeyboardSettings(storage);
    [
      'not json',
      '{"instrument":-1}',
      `{"instrument":${PLAYER_KEYBOARD_INSTRUMENTS.length}}`,
      '{"instrument":2.5}',
      '{"instrument":"3"}',
      '[]',
    ].forEach((raw) => {
      storage.setItem(PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY, raw);
      expect(settings.getInstrument()).toBe(0);
    });
  });
});
