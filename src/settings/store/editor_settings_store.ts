import { EXPORT_TARGET_DEFAULT_ID } from '@/io/export/export_targets.js';
import {
  modelExportSettingsDefault,
  modelExportSettingsParse,
  type ModelExportSettings,
} from '@/io/export/model_export_options.js';
import { areShortcutsEqual, isValidKeyboardShortcut } from '@/settings/keyboard/helpers_settings_keyboard.js';
import {
  loadKeyboardShortcutSettings,
  loadMouseSettings,
  loadUpdateSettings,
  loadViewSettings,
} from './settings_loaders.js';
import type { SettingsStorage } from '@/settings/storage/settings_storage.js';
import { LocalSettingsStorage } from '@/settings/storage/settings_storage.js';
import {
  EXPORT_SETTINGS_STORAGE_KEY,
  IMPORT_SETTINGS_STORAGE_KEY,
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  MOUSE_SETTINGS_STORAGE_KEY,
  UPDATE_SETTINGS_STORAGE_KEY,
  VIEW_SETTINGS_STORAGE_KEY,
  type EditorSettingsListener,
} from '@/settings/storage/settings_storage_keys.js';
import type {
  AnisotropyPreference,
  EditorSettingsSnapshot,
  ImportSettings,
  KeyboardShortcutAction,
  KeyboardShortcut,
  KeyboardShortcutSettings,
  MouseSettings,
  TextureFilterMode,
  UpdateSettings,
  UiThemePreference,
  ViewportPaneCount,
  ViewSettings,
} from './settings_types.js';
import { BRIGHTNESS_MAX, BRIGHTNESS_MIN, RENDERER_FONT_SIZE_MAX, RENDERER_FONT_SIZE_MIN } from './settings_types.js';
import { areMouseSettingsEqual, clampNumber, mergeMouseSettings } from './settings_value_sanitizers.js';

export {
  VIEW_SETTINGS_STORAGE_KEY,
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  MOUSE_SETTINGS_STORAGE_KEY,
  UPDATE_SETTINGS_STORAGE_KEY,
  type EditorSettingsListener,
} from '@/settings/storage/settings_storage_keys.js';

/**
 * Central editor settings store: view, mouse, keyboard and update preferences
 * and the remembered export and import choices.
 */
export class EditorSettingsStore {
  private readonly storage: SettingsStorage;
  private readonly listeners: Set<EditorSettingsListener>;
  private view: ViewSettings;
  private mouse: MouseSettings;
  private update: UpdateSettings;
  private keyboard: KeyboardShortcutSettings;
  private exportSettings: ModelExportSettings;
  private importSettings: ImportSettings;

  /**
   * Creates a settings store and loads persisted values.
   *
   * @param storage Optional storage backend (defaults to localStorage).
   */
  constructor(storage: SettingsStorage = new LocalSettingsStorage()) {
    this.storage = storage;
    this.listeners = new Set();
    this.view = loadViewSettings(storage);
    this.mouse = loadMouseSettings(storage);
    this.update = loadUpdateSettings(storage);
    this.keyboard = loadKeyboardShortcutSettings(storage);
    this.exportSettings = modelExportSettingsParse(
      storage.getItem(EXPORT_SETTINGS_STORAGE_KEY),
      modelExportSettingsDefault(EXPORT_TARGET_DEFAULT_ID),
    );
    this.importSettings = loadImportSettings(storage.getItem(IMPORT_SETTINGS_STORAGE_KEY));
  }

  /**
   * Returns an immutable snapshot of current settings.
   *
   * @returns Cloned settings snapshot.
   */
  getSnapshot(): EditorSettingsSnapshot {
    return {
      view: { ...this.view },
      mouse: { ...this.mouse },
      update: { ...this.update },
      keyboard: { ...this.keyboard },
    };
  }

  /**
   * Returns the Export dialog's remembered choices.
   *
   * @returns Settings copy.
   */
  getExportSettings(): ModelExportSettings {
    return { ...this.exportSettings, textureModes: { ...this.exportSettings.textureModes } };
  }

  /**
   * Remembers the Export dialog's choices.
   *
   * @param settings Settings.
   */
  setExportSettings(settings: ModelExportSettings): void {
    this.exportSettings = { ...settings, textureModes: { ...settings.textureModes } };
    this.storage.setItem(EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(this.exportSettings));
  }

  /**
   * Returns the remembered model import choices.
   *
   * @returns Settings copy.
   */
  getImportSettings(): ImportSettings {
    return { ...this.importSettings };
  }

  /**
   * Remembers the model import choices.
   *
   * @param settings Settings.
   */
  setImportSettings(settings: ImportSettings): void {
    this.importSettings = { ...settings };
    this.storage.setItem(IMPORT_SETTINGS_STORAGE_KEY, JSON.stringify(this.importSettings));
  }

  /**
   * Returns current view settings.
   *
   * @returns Cloned view settings.
   */
  getViewSettings(): ViewSettings {
    return { ...this.view };
  }

  /**
   * Returns current mouse navigation settings.
   *
   * @returns Cloned mouse settings.
   */
  getMouseSettings(): MouseSettings {
    return { ...this.mouse };
  }

  /** Returns standalone updater preferences. */
  getUpdateSettings(): UpdateSettings {
    return { ...this.update };
  }

  /**
   * Subscribes to settings changes.
   *
   * @param listener Callback receiving the latest snapshot.
   * @returns Unsubscribe function.
   */
  subscribe(listener: EditorSettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Sets the UI theme preference.
   *
   * @param theme System, light, or dark.
   */
  setTheme(theme: UiThemePreference): void {
    if (this.view.theme === theme) {
      return;
    }
    this.view.theme = theme;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Sets viewport texture/material brightness percent.
   *
   * @param brightness Percent from 0 to 200.
   */
  setBrightness(brightness: number): void {
    const clamped = clampNumber(brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX);
    if (this.view.brightness === clamped) {
      return;
    }
    this.view.brightness = clamped;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Sets material browser icon preview size percent.
   *
   * @param percent Size percent from 25 to 300.
   */
  setMaterialBrowserIconSizePercent(percent: number): void {
    const clamped = clampNumber(percent, 25, 300);
    if (this.view.materialBrowserIconSizePercent === clamped) {
      return;
    }
    this.view.materialBrowserIconSizePercent = clamped;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Sets the renderer / program UI font size in pixels.
   *
   * @param fontSize Font size from 8 to 72.
   */
  setRendererFontSize(fontSize: number): void {
    const clamped = clampNumber(Math.round(fontSize), RENDERER_FONT_SIZE_MIN, RENDERER_FONT_SIZE_MAX);
    if (this.view.rendererFontSize === clamped) {
      return;
    }
    this.view.rendererFontSize = clamped;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Returns the currently configured primary keyboard shortcuts.
   *
   * @returns Cloned keyboard shortcut settings.
   */
  getKeyboardShortcutSettings(): KeyboardShortcutSettings {
    return { ...this.keyboard };
  }

  /**
   * Updates one primary keyboard shortcut and persists the change.
   *
   * @param action Editor action receiving the shortcut.
   * @param shortcut Key and modifier state to assign.
   */
  setKeyboardShortcut(action: KeyboardShortcutAction, shortcut: KeyboardShortcut): void {
    if (!isValidKeyboardShortcut(shortcut) || areShortcutsEqual(this.keyboard[action], shortcut)) {
      return;
    }
    this.keyboard[action] = { ...shortcut };
    this.persistKeyboardShortcutSettings();
    this.notifyListeners();
  }

  /**
   * Sets how many viewport panes are visible in the workspace.
   *
   * @param paneCount Requested pane count from one through four.
   */
  setViewportPaneCount(paneCount: number): void {
    const clamped = clampNumber(Math.round(paneCount), 1, 4) as ViewportPaneCount;
    if (this.view.viewportPaneCount === clamped) {
      return;
    }
    this.view.viewportPaneCount = clamped;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Sets whether expanded toolbar icons include visible text labels.
   *
   * @param enabled Whether labels should appear in expanded mode.
   */
  setToolbarButtonLabels(enabled: boolean): void {
    if (this.view.toolbarButtonLabels === enabled) return;
    this.view.toolbarButtonLabels = enabled;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Sets the content texture sampling mode.
   *
   * @param mode Point, bilinear, or trilinear sampling.
   */
  setTextureFilterMode(mode: TextureFilterMode): void {
    if (this.view.textureFilterMode === mode) {
      return;
    }
    this.view.textureFilterMode = mode;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Sets anisotropic filtering for content surface maps.
   *
   * @param preference Discrete level, maximum, or off.
   */
  setAnisotropyPreference(preference: AnisotropyPreference): void {
    if (this.view.anisotropyPreference === preference) {
      return;
    }
    this.view.anisotropyPreference = preference;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Updates one mouse navigation preference.
   *
   * @param settings Updated settings values.
   */
  updateMouseSettings(settings: Partial<MouseSettings>): void {
    const next = mergeMouseSettings(this.mouse, settings);
    if (areMouseSettingsEqual(this.mouse, next)) return;
    this.mouse = next;
    this.persistMouseSettings();
    this.notifyListeners();
  }

  /**
   * Enables or disables automatic standalone release checks.
   *
   * @param enabled Whether the updater should check when the Update tab opens.
   */
  setAutomaticUpdateChecksEnabled(enabled: boolean): void {
    if (this.update.automaticChecks === enabled) return;
    this.update = { automaticChecks: enabled };
    this.persistUpdateSettings();
    this.notifyListeners();
  }

  /** Writes view settings to storage. */
  private persistViewSettings(): void {
    this.storage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(this.view));
  }

  /** Writes mouse navigation settings to storage. */
  private persistMouseSettings(): void {
    this.storage.setItem(MOUSE_SETTINGS_STORAGE_KEY, JSON.stringify(this.mouse));
  }

  /** Writes standalone updater preferences to storage. */
  private persistUpdateSettings(): void {
    this.storage.setItem(UPDATE_SETTINGS_STORAGE_KEY, JSON.stringify(this.update));
  }

  /** Writes keyboard shortcut settings to storage. */
  private persistKeyboardShortcutSettings(): void {
    this.storage.setItem(KEYBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(this.keyboard));
  }

  /** Notifies all subscribers with a fresh snapshot. */
  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

/**
 * Reads stored import choices, keeping the defaults for anything invalid.
 *
 * @param raw Stored JSON, or null.
 * @returns Import settings.
 */
function loadImportSettings(raw: string | null): ImportSettings {
  const defaults: ImportSettings = { objSourceTargetId: EXPORT_TARGET_DEFAULT_ID };
  if (raw === null) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<ImportSettings>;
    const id = parsed.objSourceTargetId;
    return { objSourceTargetId: typeof id === 'string' && id !== '' ? id : defaults.objSourceTargetId };
  } catch {
    return defaults;
  }
}
