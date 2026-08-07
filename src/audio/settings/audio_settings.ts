import type { SettingsStorage } from '@/settings/storage/settings_storage.js';
import { LocalSettingsStorage, MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';

/** Storage key for audio preference JSON. */
export const AUDIO_SETTINGS_STORAGE_KEY = 'aiworlded.settings.audio';

/** Serializable audio preference snapshot. */
export interface AudioSettingsSnapshot {
  enabled: boolean;
}

/**
 * Returns default audio settings (enabled on).
 *
 * @returns Fresh default snapshot.
 */
export function createDefaultAudioSettings(): AudioSettingsSnapshot {
  return { enabled: true };
}

/**
 * Loads audio settings from storage with defaults for missing fields.
 *
 * @param storage Settings storage backend.
 * @returns Loaded or default snapshot.
 */
export function loadAudioSettings(storage: SettingsStorage): AudioSettingsSnapshot {
  const raw = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return createDefaultAudioSettings();
  }
  return parseAudioSettingsJson(raw);
}

/**
 * Parses stored audio JSON into a sanitized snapshot.
 *
 * @param raw JSON string from storage.
 * @returns Sanitized snapshot.
 */
function parseAudioSettingsJson(raw: string): AudioSettingsSnapshot {
  try {
    const parsed = JSON.parse(raw) as Partial<AudioSettingsSnapshot>;
    return { enabled: parsed.enabled !== false };
  } catch {
    return createDefaultAudioSettings();
  }
}

/**
 * Creates the default storage backend, falling back to memory when localStorage
 * is unavailable.
 *
 * @returns Settings storage implementation.
 */
function createDefaultAudioStorage(): SettingsStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return new LocalSettingsStorage(window.localStorage);
  }
  return new MemorySettingsStorage();
}

/** Persists and exposes the editor audio enabled toggle. */
export class AudioSettings {
  private readonly storage: SettingsStorage;
  private enabled: boolean;

  /**
   * Creates audio settings and loads the persisted enabled flag.
   *
   * @param storage Optional storage backend; when omitted, uses localStorage if
   *   available, otherwise memory.
   */
  constructor(storage: SettingsStorage = createDefaultAudioStorage()) {
    this.storage = storage;
    this.enabled = loadAudioSettings(storage).enabled;
  }

  /**
   * Returns whether editor audio feedback is enabled.
   *
   * @returns True when sounds may play.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Sets whether editor audio feedback is enabled and persists the value.
   * Clears pending and snapshotted frame events when the value changes.
   *
   * @param enabled Desired enabled state.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    notificationFrameEvents.reset();
    this.persist();
  }

  /**
   * Toggles the enabled flag and persists the new value.
   *
   * @returns The new enabled state.
   */
  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  /** Writes the current snapshot to storage. */
  private persist(): void {
    const snapshot: AudioSettingsSnapshot = { enabled: this.enabled };
    this.storage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
  }
}

/** Shared AudioSettings instance. */
export const audioSettings = new AudioSettings();
