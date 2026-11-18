import {
  createDefaultDiscordSettings,
  createDefaultKeyboardShortcutSettings,
  createDefaultMouseSettings,
  createDefaultUpdateSettings,
  createDefaultViewSettings,
} from './settings_defaults.js';
import { mergeKeyboardShortcutSettings } from '@/settings/keyboard/helpers_settings_keyboard.js';
import type { SettingsStorage } from '@/settings/storage/settings_storage.js';
import {
  DISCORD_SETTINGS_STORAGE_KEY,
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  MOUSE_SETTINGS_STORAGE_KEY,
  UPDATE_SETTINGS_STORAGE_KEY,
  VIEW_SETTINGS_STORAGE_KEY,
} from '@/settings/storage/settings_storage_keys.js';
import type {
  DiscordSettings,
  KeyboardShortcutSettings,
  MouseSettings,
  UpdateSettings,
  ViewSettings,
} from './settings_types.js';
import { mergeMouseSettings, mergeViewSettings, sanitizeBoolean } from './settings_value_sanitizers.js';

/**
 * Loads view settings from storage with defaults for missing fields.
 *
 * @param storage Settings storage backend.
 * @returns Loaded view settings.
 */
export function loadViewSettings(storage: SettingsStorage): ViewSettings {
  const defaults = createDefaultViewSettings();
  const raw = storage.getItem(VIEW_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return defaults;
  }
  return mergeViewSettings(defaults, raw);
}

/**
 * Loads mouse navigation settings and fills missing values with defaults.
 *
 * @param storage Settings storage backend.
 * @returns Valid mouse settings.
 */
export function loadMouseSettings(storage: SettingsStorage): MouseSettings {
  const defaults = createDefaultMouseSettings();
  const raw = storage.getItem(MOUSE_SETTINGS_STORAGE_KEY);
  if (!raw) return defaults;
  try {
    return mergeMouseSettings(defaults, JSON.parse(raw) as Partial<MouseSettings>);
  } catch {
    return defaults;
  }
}

/**
 * Loads standalone updater preferences with safe defaults.
 *
 * @param storage Settings storage backend.
 * @returns Valid update settings.
 */
export function loadUpdateSettings(storage: SettingsStorage): UpdateSettings {
  const defaults = createDefaultUpdateSettings();
  const raw = storage.getItem(UPDATE_SETTINGS_STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<UpdateSettings>;
    return {
      automaticChecks: sanitizeBoolean(parsed.automaticChecks, defaults.automaticChecks),
    };
  } catch {
    return defaults;
  }
}

/**
 * Loads desktop Discord Rich Presence preferences with safe defaults.
 *
 * @param storage Settings storage backend.
 * @returns Valid Discord settings.
 */
export function loadDiscordSettings(storage: SettingsStorage): DiscordSettings {
  const defaults = createDefaultDiscordSettings();
  const raw = storage.getItem(DISCORD_SETTINGS_STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<DiscordSettings>;
    return {
      richPresenceEnabled: sanitizeBoolean(parsed.richPresenceEnabled, defaults.richPresenceEnabled),
      hideProjectName: sanitizeBoolean(parsed.hideProjectName, defaults.hideProjectName),
    };
  } catch {
    return defaults;
  }
}

/**
 * Loads keyboard shortcut settings and fills missing values with defaults.
 *
 * @param storage Settings storage backend.
 * @returns Valid keyboard shortcut settings.
 */
export function loadKeyboardShortcutSettings(storage: SettingsStorage): KeyboardShortcutSettings {
  const defaults = createDefaultKeyboardShortcutSettings();
  const raw = storage.getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<KeyboardShortcutSettings>;
    return mergeKeyboardShortcutSettings(defaults, parsed);
  } catch {
    return defaults;
  }
}
