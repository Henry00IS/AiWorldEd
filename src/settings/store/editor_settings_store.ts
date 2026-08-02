import {
  areValidCoordinateAxes,
  BUILT_IN_COORDINATE_SPACE_PRESETS,
  cloneCoordinateSpace,
  createDefaultCoordinateSpace,
  deriveHandedness,
  getBuiltInCoordinateSpace,
} from '@/settings/coordinate/coordinate_space_presets.js';
import type { AxisDirection, CoordinateSpaceDefinition } from '@/settings/coordinate/coordinate_space_types.js';
import { CustomCoordinateSpaceRepository } from '@/settings/coordinate/custom_coordinate_space_repository.js';
import { cloneProfile } from '@/settings/profiles/game_profile_clone.js';
import { createDefaultGameProfile } from './settings_defaults.js';
import { createProfileId, GameProfileRepository } from '@/settings/profiles/game_profile_repository.js';
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
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  MOUSE_SETTINGS_STORAGE_KEY,
  UPDATE_SETTINGS_STORAGE_KEY,
  VIEW_SETTINGS_STORAGE_KEY,
  type EditorSettingsListener,
} from '@/settings/storage/settings_storage_keys.js';
import type {
  AnisotropyPreference,
  EditorSettingsSnapshot,
  GameProfile,
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
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  CAMERA_WIDGET_SIZE_MAX_PX,
  CAMERA_WIDGET_SIZE_MIN_PX,
  RENDERER_FONT_SIZE_MAX,
  RENDERER_FONT_SIZE_MIN,
} from './settings_types.js';
import { areMouseSettingsEqual, clampNumber, mergeMouseSettings } from './settings_value_sanitizers.js';
import type { ImperialUnit, MetricUnit, UnitSystem } from '@/settings/units/unit_presets.js';

export {
  VIEW_SETTINGS_STORAGE_KEY,
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  MOUSE_SETTINGS_STORAGE_KEY,
  UPDATE_SETTINGS_STORAGE_KEY,
  type EditorSettingsListener,
} from '@/settings/storage/settings_storage_keys.js';

/**
 * Central editor settings store for game profiles and view preferences.
 * Persists game profiles as one JSON document each and view settings
 * separately.
 */
export class EditorSettingsStore {
  private readonly storage: SettingsStorage;
  private readonly repository: GameProfileRepository;
  private readonly coordinateSpaceRepository: CustomCoordinateSpaceRepository;
  private readonly listeners: Set<EditorSettingsListener>;
  private profiles: GameProfile[];
  private activeGameProfileId: string | null;
  private customCoordinateSpaces: CoordinateSpaceDefinition[];
  private view: ViewSettings;
  private mouse: MouseSettings;
  private update: UpdateSettings;
  private keyboard: KeyboardShortcutSettings;

  /**
   * Creates a settings store and loads persisted values.
   *
   * @param storage Optional storage backend (defaults to localStorage).
   * @param repository Optional profile repository override for tests.
   */
  constructor(storage: SettingsStorage = new LocalSettingsStorage(), repository?: GameProfileRepository) {
    this.storage = storage;
    this.repository = repository ?? new GameProfileRepository(storage);
    this.coordinateSpaceRepository = new CustomCoordinateSpaceRepository(storage);
    this.listeners = new Set();
    this.view = loadViewSettings(storage);
    this.mouse = loadMouseSettings(storage);
    this.update = loadUpdateSettings(storage);
    this.keyboard = loadKeyboardShortcutSettings(storage);
    this.customCoordinateSpaces = this.coordinateSpaceRepository.loadAll().map((space) => cloneCoordinateSpace(space));
    const loaded = this.repository.loadAll();
    this.profiles = loaded.profiles.map((profile) => cloneProfile(profile));
    this.activeGameProfileId = loaded.activeGameProfileId;
  }

  /**
   * Returns an immutable snapshot of current settings.
   *
   * @returns Cloned settings snapshot.
   */
  getSnapshot(): EditorSettingsSnapshot {
    return {
      activeGameProfileId: this.activeGameProfileId,
      gameProfiles: this.profiles.map((profile) => cloneProfile(profile)),
      customCoordinateSpaces: this.customCoordinateSpaces.map((space) => cloneCoordinateSpace(space)),
      view: { ...this.view },
      mouse: { ...this.mouse },
      update: { ...this.update },
      keyboard: { ...this.keyboard },
    };
  }

  /**
   * Returns built-in and custom coordinate space presets for selection UI.
   *
   * @returns Ordered preset list (built-ins first).
   */
  listCoordinateSpacePresets(): CoordinateSpaceDefinition[] {
    const builtIns = BUILT_IN_COORDINATE_SPACE_PRESETS.map((space) => cloneCoordinateSpace(space));
    const customs = this.customCoordinateSpaces.map((space) => cloneCoordinateSpace(space));
    return [...builtIns, ...customs];
  }

  /**
   * Returns the currently active game profile, if any.
   *
   * @returns Active profile clone or null.
   */
  getActiveGameProfile(): GameProfile | null {
    const profile = this.profiles.find((entry) => entry.id === this.activeGameProfileId);
    return profile ? cloneProfile(profile) : null;
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
   * Adds a new game profile, persists it as its own JSON file, and activates
   * it.
   *
   * @param name Optional display name for the new profile.
   * @returns The created profile.
   */
  addGameProfile(name?: string): GameProfile {
    const profileName = name?.trim() || this.buildNextProfileName();
    const profile = createDefaultGameProfile(createProfileId(), profileName);
    this.profiles.push(profile);
    this.activeGameProfileId = profile.id;
    this.persistProfiles();
    this.notifyListeners();
    return cloneProfile(profile);
  }

  /**
   * Selects the active game profile by id.
   *
   * @param profileId Profile identifier.
   */
  setActiveGameProfileId(profileId: string): void {
    const exists = this.profiles.some((profile) => profile.id === profileId);
    if (!exists || this.activeGameProfileId === profileId) {
      return;
    }
    this.activeGameProfileId = profileId;
    this.persistProfiles();
    this.notifyListeners();
  }

  /**
   * Renames a game profile and rewrites its JSON document.
   *
   * @param profileId Profile identifier.
   * @param name New display name.
   */
  renameGameProfile(profileId: string, name: string): void {
    const profile = this.findProfile(profileId);
    const trimmed = name.trim();
    if (!profile || trimmed.length === 0 || profile.name === trimmed) {
      return;
    }
    profile.name = trimmed;
    this.persistProfiles();
    this.notifyListeners();
  }

  /**
   * Updates the unit system for a profile and refreshes dependent unit UI
   * state.
   *
   * @param profileId Profile identifier.
   * @param unitSystem Metric or imperial.
   */
  setGameProfileUnitSystem(profileId: string, unitSystem: UnitSystem): void {
    const profile = this.findProfile(profileId);
    if (!profile || profile.unitSystem === unitSystem) {
      return;
    }
    profile.unitSystem = unitSystem;
    this.persistProfiles();
    this.notifyListeners();
  }

  /**
   * Sets the metric length unit for a profile.
   *
   * @param profileId Profile identifier.
   * @param metricUnit Metric unit option.
   */
  setGameProfileMetricUnit(profileId: string, metricUnit: MetricUnit): void {
    const profile = this.findProfile(profileId);
    if (!profile || profile.metricUnit === metricUnit) {
      return;
    }
    profile.metricUnit = metricUnit;
    this.persistProfiles();
    this.notifyListeners();
  }

  /**
   * Sets the imperial length unit for a profile.
   *
   * @param profileId Profile identifier.
   * @param imperialUnit Imperial unit option.
   */
  setGameProfileImperialUnit(profileId: string, imperialUnit: ImperialUnit): void {
    const profile = this.findProfile(profileId);
    if (!profile || profile.imperialUnit === imperialUnit) {
      return;
    }
    profile.imperialUnit = imperialUnit;
    this.persistProfiles();
    this.notifyListeners();
  }

  /**
   * Removes a game profile and its JSON document when more than one remains.
   *
   * @param profileId Profile identifier.
   * @returns True when a profile was removed.
   */
  removeGameProfile(profileId: string): boolean {
    if (this.profiles.length <= 1) {
      return false;
    }
    const index = this.profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) {
      return false;
    }
    this.profiles.splice(index, 1);
    this.ensureActiveProfileAfterRemoval();
    this.persistProfiles();
    this.notifyListeners();
    return true;
  }

  /**
   * Applies a built-in or custom coordinate space preset to a game profile.
   *
   * @param profileId Profile identifier.
   * @param presetId Built-in or custom preset id.
   */
  setGameProfileCoordinateSpacePreset(profileId: string, presetId: string): void {
    const profile = this.findProfile(profileId);
    const preset = this.findCoordinateSpacePreset(presetId);
    if (!profile || !preset) {
      return;
    }
    if (profile.coordinateSpace.presetId === preset.presetId) {
      return;
    }
    profile.coordinateSpace = cloneCoordinateSpace(preset);
    this.persistProfiles();
    this.notifyListeners();
  }

  /**
   * Creates a custom coordinate space preset, saves it, and assigns it to a
   * profile.
   *
   * @param profileId Profile that receives the new preset.
   * @param name Optional display name.
   * @returns The created custom coordinate space.
   */
  addCustomCoordinateSpace(profileId: string, name?: string): CoordinateSpaceDefinition | null {
    const profile = this.findProfile(profileId);
    if (!profile) {
      return null;
    }
    const space = this.buildNewCustomCoordinateSpace(name);
    this.customCoordinateSpaces.push(space);
    profile.coordinateSpace = cloneCoordinateSpace(space);
    this.persistCustomCoordinateSpaces();
    this.persistProfiles();
    this.notifyListeners();
    return cloneCoordinateSpace(space);
  }

  /**
   * Renames a custom coordinate space and updates profiles that reference it.
   *
   * @param presetId Custom preset id.
   * @param name New display name.
   */
  renameCustomCoordinateSpace(presetId: string, name: string): void {
    const space = this.findCustomCoordinateSpace(presetId);
    const trimmed = name.trim();
    if (!space || trimmed.length === 0 || space.name === trimmed) {
      return;
    }
    space.name = trimmed;
    this.syncProfilesUsingCoordinateSpace(space);
    this.persistCustomCoordinateSpaces();
    this.persistProfiles();
    this.notifyListeners();
  }

  /**
   * Updates one axis on a custom coordinate space and re-derives handedness.
   *
   * @param presetId Custom preset id.
   * @param axis Role being edited.
   * @param direction New axis direction.
   * @returns True when the update was applied.
   */
  setCustomCoordinateSpaceAxis(presetId: string, axis: 'up' | 'right' | 'forward', direction: AxisDirection): boolean {
    const space = this.findCustomCoordinateSpace(presetId);
    if (!space || space[axis] === direction) {
      return false;
    }
    if (!this.tryApplyCoordinateSpaceAxis(space, axis, direction)) {
      return false;
    }
    this.syncProfilesUsingCoordinateSpace(space);
    this.persistCustomCoordinateSpaces();
    this.persistProfiles();
    this.notifyListeners();
    return true;
  }

  /**
   * Removes a custom coordinate space preset. Profiles still using it fall back
   * to the default Godot preset.
   *
   * @param presetId Custom preset id.
   * @returns True when a preset was removed.
   */
  removeCustomCoordinateSpace(presetId: string): boolean {
    const index = this.customCoordinateSpaces.findIndex((space) => space.presetId === presetId);
    if (index < 0) {
      return false;
    }
    this.customCoordinateSpaces.splice(index, 1);
    this.fallbackProfilesUsingPreset(presetId);
    this.persistCustomCoordinateSpaces();
    this.persistProfiles();
    this.notifyListeners();
    return true;
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
   * Sets the perspective orientation widget size in logical pixels.
   *
   * @param sizePx Widget edge length from 48 to 192 logical pixels.
   */
  setCameraWidgetSizePx(sizePx: number): void {
    const clamped = clampNumber(Math.round(sizePx), CAMERA_WIDGET_SIZE_MIN_PX, CAMERA_WIDGET_SIZE_MAX_PX);
    if (this.view.cameraWidgetSizePx === clamped) return;
    this.view.cameraWidgetSizePx = clamped;
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

  /**
   * Returns JSON file contents for a profile id.
   *
   * @param profileId Profile identifier.
   * @returns JSON text or null when missing.
   */
  getGameProfileJson(profileId: string): string | null {
    const profile = this.findProfile(profileId);
    if (!profile) {
      return null;
    }
    return this.repository.getProfileJsonFileContents(profile);
  }

  /**
   * Returns the `.json` filename for a profile id.
   *
   * @param profileId Profile identifier.
   * @returns Filename or null when missing.
   */
  getGameProfileFileName(profileId: string): string | null {
    const profile = this.findProfile(profileId);
    if (!profile) {
      return null;
    }
    return this.repository.getProfileFileName(profile);
  }

  /**
   * Imports a game profile JSON document as a new active profile. Imported
   * profiles receive a new local id so loading a file never replaces an
   * existing profile. Imported custom coordinate spaces are registered as
   * independent editable presets.
   *
   * @param jsonText Profile JSON file contents.
   * @returns The newly imported profile.
   * @throws Error when the JSON document is invalid.
   */
  importGameProfileJson(jsonText: string): GameProfile {
    const parsed = this.repository.parseProfileFile(jsonText);
    const profile = cloneProfile(parsed);
    profile.id = createProfileId();
    this.registerImportedCustomCoordinateSpace(profile);
    this.profiles.push(profile);
    this.activeGameProfileId = profile.id;
    this.persistCustomCoordinateSpaces();
    this.persistProfiles();
    this.notifyListeners();
    return cloneProfile(profile);
  }

  /**
   * Registers an imported custom coordinate space under a new local id.
   *
   * @param profile Imported profile whose custom space may be registered.
   */
  private registerImportedCustomCoordinateSpace(profile: GameProfile): void {
    if (!profile.coordinateSpace.isCustom) {
      return;
    }
    const space = cloneCoordinateSpace(profile.coordinateSpace);
    space.presetId = createProfileId();
    this.customCoordinateSpaces.push(space);
    profile.coordinateSpace = cloneCoordinateSpace(space);
  }

  /**
   * Finds a mutable profile by id.
   *
   * @param profileId Profile identifier.
   * @returns Profile reference or undefined.
   */
  private findProfile(profileId: string): GameProfile | undefined {
    return this.profiles.find((profile) => profile.id === profileId);
  }

  /**
   * Finds a built-in or custom coordinate space by preset id.
   *
   * @param presetId Preset identifier.
   * @returns Cloned definition or null.
   */
  private findCoordinateSpacePreset(presetId: string): CoordinateSpaceDefinition | null {
    const builtIn = getBuiltInCoordinateSpace(presetId);
    if (builtIn) {
      return builtIn;
    }
    const custom = this.findCustomCoordinateSpace(presetId);
    return custom ? cloneCoordinateSpace(custom) : null;
  }

  /**
   * Finds a mutable custom coordinate space by id.
   *
   * @param presetId Custom preset identifier.
   * @returns Mutable custom space or undefined.
   */
  private findCustomCoordinateSpace(presetId: string): CoordinateSpaceDefinition | undefined {
    return this.customCoordinateSpaces.find((space) => space.presetId === presetId);
  }

  /**
   * Builds a new custom coordinate space based on Godot defaults.
   *
   * @param name Optional display name.
   * @returns New custom definition.
   */
  private buildNewCustomCoordinateSpace(name?: string): CoordinateSpaceDefinition {
    const base = createDefaultCoordinateSpace();
    base.presetId = createProfileId();
    base.name = name?.trim() || this.buildNextCustomSpaceName();
    base.isCustom = true;
    return base;
  }

  /**
   * Builds a unique default name for a custom coordinate space.
   *
   * @returns Display name.
   */
  private buildNextCustomSpaceName(): string {
    let suffix = this.customCoordinateSpaces.length + 1;
    let candidate = `Custom ${suffix}`;
    while (this.customCoordinateSpaces.some((space) => space.name === candidate)) {
      suffix += 1;
      candidate = `Custom ${suffix}`;
    }
    return candidate;
  }

  /**
   * Copies an updated custom space onto all profiles that use its id.
   *
   * @param space Updated custom coordinate space.
   */
  private syncProfilesUsingCoordinateSpace(space: CoordinateSpaceDefinition): void {
    this.profiles.forEach((profile) => {
      if (profile.coordinateSpace.presetId === space.presetId) {
        profile.coordinateSpace = cloneCoordinateSpace(space);
      }
    });
  }

  /**
   * Builds a unique default name for a newly added profile.
   *
   * @returns Display name.
   */
  private buildNextProfileName(): string {
    const baseName = 'Game';
    let suffix = this.profiles.length + 1;
    let candidate = `${baseName} ${suffix}`;
    while (this.profiles.some((profile) => profile.name === candidate)) {
      suffix += 1;
      candidate = `${baseName} ${suffix}`;
    }
    return candidate;
  }

  /** Ensures the active id still points at an existing profile after deletion. */
  private ensureActiveProfileAfterRemoval(): void {
    const stillActive = this.profiles.some((profile) => profile.id === this.activeGameProfileId);
    if (!stillActive) {
      this.activeGameProfileId = this.profiles[0]?.id ?? null;
    }
  }

  /**
   * Tries to apply a new axis direction onto a custom space.
   *
   * @param space Mutable custom coordinate space.
   * @param axis Role being edited.
   * @param direction New axis direction.
   * @returns True when axes remain valid and handedness was derived.
   */
  private tryApplyCoordinateSpaceAxis(
    space: CoordinateSpaceDefinition,
    axis: 'up' | 'right' | 'forward',
    direction: AxisDirection,
  ): boolean {
    const next = cloneCoordinateSpace(space);
    next[axis] = direction;
    if (!areValidCoordinateAxes(next.up, next.right, next.forward)) {
      return false;
    }
    const handedness = deriveHandedness(next.up, next.right, next.forward);
    if (!handedness) {
      return false;
    }
    space.up = next.up;
    space.right = next.right;
    space.forward = next.forward;
    space.handedness = handedness;
    return true;
  }

  /**
   * Resets profiles that referenced a removed custom preset to the default
   * space.
   *
   * @param presetId Removed custom preset id.
   */
  private fallbackProfilesUsingPreset(presetId: string): void {
    const fallback = createDefaultCoordinateSpace();
    this.profiles.forEach((profile) => {
      if (profile.coordinateSpace.presetId === presetId) {
        profile.coordinateSpace = cloneCoordinateSpace(fallback);
      }
    });
  }

  /** Writes all game profiles through the repository. */
  private persistProfiles(): void {
    this.repository.saveAll(this.profiles, this.activeGameProfileId);
  }

  /** Writes custom coordinate space presets to storage. */
  private persistCustomCoordinateSpaces(): void {
    this.coordinateSpaceRepository.saveAll(this.customCoordinateSpaces);
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
