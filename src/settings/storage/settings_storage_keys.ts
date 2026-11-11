import type { EditorSettingsSnapshot } from '@/settings/store/settings_types.js';

/** Storage key for view settings JSON. */
export const VIEW_SETTINGS_STORAGE_KEY = 'aiworlded.settings.view';

/** Storage key for primary editor keyboard shortcuts. */
export const KEYBOARD_SHORTCUTS_STORAGE_KEY = 'aiworlded.settings.keyboard';

/** Storage key for mouse navigation settings JSON. */
export const MOUSE_SETTINGS_STORAGE_KEY = 'aiworlded.settings.mouse';

/** Storage key for standalone updater preferences JSON. */
export const UPDATE_SETTINGS_STORAGE_KEY = 'aiworlded.settings.update';

/** Storage key for the Export dialog's choices JSON. */
export const EXPORT_SETTINGS_STORAGE_KEY = 'aiworlded.settings.export';

/** Storage key for model import choices JSON. */
export const IMPORT_SETTINGS_STORAGE_KEY = 'aiworlded.settings.import';

/** Listener notified when any settings value changes. */
export type EditorSettingsListener = (snapshot: EditorSettingsSnapshot) => void;
