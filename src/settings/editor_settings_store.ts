import {
  areValidCoordinateAxes,
  BUILT_IN_COORDINATE_SPACE_PRESETS,
  cloneCoordinateSpace,
  createDefaultCoordinateSpace,
  deriveHandedness,
  getBuiltInCoordinateSpace
} from './coordinate_space_presets.js';
import type {
  AxisDirection,
  CoordinateSpaceDefinition,
  Handedness
} from './coordinate_space_types.js';
import { CustomCoordinateSpaceRepository } from './custom_coordinate_space_repository.js';
import {
  createDefaultGameProfile,
  createDefaultKeyboardShortcutSettings,
  createDefaultViewSettings
} from './settings_defaults.js';
import { createProfileId, GameProfileRepository } from './game_profile_repository.js';
import type { SettingsStorage } from './settings_storage.js';
import { LocalSettingsStorage } from './settings_storage.js';
import type {
  EditorSettingsSnapshot,
  GameProfile,
  KeyboardShortcutAction,
  KeyboardShortcut,
  KeyboardShortcutSettings,
  UiThemePreference,
  ViewportPaneCount,
  ViewSettings
} from './settings_types.js';
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  RENDERER_FONT_SIZE_MAX,
  RENDERER_FONT_SIZE_MIN
} from './settings_types.js';
import type { ImperialUnit, MetricUnit, UnitSystem } from './unit_presets.js';

/** Storage key for view settings JSON. */
export const VIEW_SETTINGS_STORAGE_KEY = 'aiworlded.settings.view';

/** Storage key for primary editor keyboard shortcuts. */
export const KEYBOARD_SHORTCUTS_STORAGE_KEY = 'aiworlded.settings.keyboard';

/** Listener notified when any settings value changes. */
export type EditorSettingsListener = (snapshot: EditorSettingsSnapshot) => void;

/**
 * Central editor settings store for game profiles and view preferences.
 * Persists game profiles as one JSON document each and view settings separately.
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
  private keyboard: KeyboardShortcutSettings;

  /**
   * Creates a settings store and loads persisted values.
   * @param storage Optional storage backend (defaults to localStorage).
   * @param repository Optional profile repository override for tests.
   */
  constructor(
    storage: SettingsStorage = new LocalSettingsStorage(),
    repository?: GameProfileRepository
  ) {
    this.storage = storage;
    this.repository = repository ?? new GameProfileRepository(storage);
    this.coordinateSpaceRepository = new CustomCoordinateSpaceRepository(storage);
    this.listeners = new Set();
    this.view = this.loadViewSettings();
    this.keyboard = this.loadKeyboardShortcutSettings();
    this.customCoordinateSpaces = this.coordinateSpaceRepository
      .loadAll()
      .map((space) => cloneCoordinateSpace(space));
    const loaded = this.repository.loadAll();
    this.profiles = loaded.profiles.map((profile) => cloneProfile(profile));
    this.activeGameProfileId = loaded.activeGameProfileId;
  }

  /**
   * Returns an immutable snapshot of current settings.
   * @returns Cloned settings snapshot.
   */
  getSnapshot(): EditorSettingsSnapshot {
    return {
      activeGameProfileId: this.activeGameProfileId,
      gameProfiles: this.profiles.map((profile) => cloneProfile(profile)),
      customCoordinateSpaces: this.customCoordinateSpaces.map((space) =>
        cloneCoordinateSpace(space)
      ),
      view: { ...this.view },
      keyboard: { ...this.keyboard }
    };
  }

  /**
   * Returns built-in and custom coordinate space presets for selection UI.
   * @returns Ordered preset list (built-ins first).
   */
  listCoordinateSpacePresets(): CoordinateSpaceDefinition[] {
    const builtIns = BUILT_IN_COORDINATE_SPACE_PRESETS.map((space) =>
      cloneCoordinateSpace(space)
    );
    const customs = this.customCoordinateSpaces.map((space) =>
      cloneCoordinateSpace(space)
    );
    return [...builtIns, ...customs];
  }

  /**
   * Returns the currently active game profile, if any.
   * @returns Active profile clone or null.
   */
  getActiveGameProfile(): GameProfile | null {
    const profile = this.profiles.find(
      (entry) => entry.id === this.activeGameProfileId
    );
    return profile ? cloneProfile(profile) : null;
  }

  /**
   * Returns current view settings.
   * @returns Cloned view settings.
   */
  getViewSettings(): ViewSettings {
    return { ...this.view };
  }

  /**
   * Subscribes to settings changes.
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
   * Adds a new game profile, persists it as its own JSON file, and activates it.
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
   * Updates the unit system for a profile and refreshes dependent unit UI state.
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
   * @param profileId Profile identifier.
   * @param imperialUnit Imperial unit option.
   */
  setGameProfileImperialUnit(
    profileId: string,
    imperialUnit: ImperialUnit
  ): void {
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
   * @param profileId Profile identifier.
   * @param presetId Built-in or custom preset id.
   */
  setGameProfileCoordinateSpacePreset(
    profileId: string,
    presetId: string
  ): void {
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
   * Creates a custom coordinate space preset, saves it, and assigns it to a profile.
   * @param profileId Profile that receives the new preset.
   * @param name Optional display name.
   * @returns The created custom coordinate space.
   */
  addCustomCoordinateSpace(
    profileId: string,
    name?: string
  ): CoordinateSpaceDefinition | null {
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
   * @param presetId Custom preset id.
   * @param axis Role being edited.
   * @param direction New axis direction.
   * @returns True when the update was applied.
   */
  setCustomCoordinateSpaceAxis(
    presetId: string,
    axis: 'up' | 'right' | 'forward',
    direction: AxisDirection
  ): boolean {
    const space = this.findCustomCoordinateSpace(presetId);
    if (!space || space[axis] === direction) {
      return false;
    }
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
    this.syncProfilesUsingCoordinateSpace(space);
    this.persistCustomCoordinateSpaces();
    this.persistProfiles();
    this.notifyListeners();
    return true;
  }

  /**
   * Removes a custom coordinate space preset.
   * Profiles still using it fall back to the default Godot preset.
   * @param presetId Custom preset id.
   * @returns True when a preset was removed.
   */
  removeCustomCoordinateSpace(presetId: string): boolean {
    const index = this.customCoordinateSpaces.findIndex(
      (space) => space.presetId === presetId
    );
    if (index < 0) {
      return false;
    }
    this.customCoordinateSpaces.splice(index, 1);
    const fallback = createDefaultCoordinateSpace();
    this.profiles.forEach((profile) => {
      if (profile.coordinateSpace.presetId === presetId) {
        profile.coordinateSpace = cloneCoordinateSpace(fallback);
      }
    });
    this.persistCustomCoordinateSpaces();
    this.persistProfiles();
    this.notifyListeners();
    return true;
  }

  /**
   * Sets the UI theme preference.
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
   * @param fontSize Font size from 8 to 72.
   */
  setRendererFontSize(fontSize: number): void {
    const clamped = clampNumber(
      Math.round(fontSize),
      RENDERER_FONT_SIZE_MIN,
      RENDERER_FONT_SIZE_MAX
    );
    if (this.view.rendererFontSize === clamped) {
      return;
    }
    this.view.rendererFontSize = clamped;
    this.persistViewSettings();
    this.notifyListeners();
  }

  /**
   * Returns the currently configured primary keyboard shortcuts.
   * @returns Cloned keyboard shortcut settings.
   */
  getKeyboardShortcutSettings(): KeyboardShortcutSettings {
    return { ...this.keyboard };
  }

  /**
   * Updates one primary keyboard shortcut and persists the change.
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
   * Returns JSON file contents for a profile id.
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
   * Imports a game profile JSON document as a new active profile.
   * Imported profiles receive a new local id so loading a file never replaces
   * an existing profile. Imported custom coordinate spaces are registered as
   * independent editable presets.
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
   * @param profileId Profile identifier.
   * @returns Profile reference or undefined.
   */
  private findProfile(profileId: string): GameProfile | undefined {
    return this.profiles.find((profile) => profile.id === profileId);
  }

  /**
   * Finds a built-in or custom coordinate space by preset id.
   * @param presetId Preset identifier.
   * @returns Cloned definition or null.
   */
  private findCoordinateSpacePreset(
    presetId: string
  ): CoordinateSpaceDefinition | null {
    const builtIn = getBuiltInCoordinateSpace(presetId);
    if (builtIn) {
      return builtIn;
    }
    const custom = this.findCustomCoordinateSpace(presetId);
    return custom ? cloneCoordinateSpace(custom) : null;
  }

  /**
   * Finds a mutable custom coordinate space by id.
   * @param presetId Custom preset identifier.
   * @returns Mutable custom space or undefined.
   */
  private findCustomCoordinateSpace(
    presetId: string
  ): CoordinateSpaceDefinition | undefined {
    return this.customCoordinateSpaces.find(
      (space) => space.presetId === presetId
    );
  }

  /**
   * Builds a new custom coordinate space based on Godot defaults.
   * @param name Optional display name.
   * @returns New custom definition.
   */
  private buildNewCustomCoordinateSpace(
    name?: string
  ): CoordinateSpaceDefinition {
    const base = createDefaultCoordinateSpace();
    base.presetId = createProfileId();
    base.name = name?.trim() || this.buildNextCustomSpaceName();
    base.isCustom = true;
    return base;
  }

  /**
   * Builds a unique default name for a custom coordinate space.
   * @returns Display name.
   */
  private buildNextCustomSpaceName(): string {
    let suffix = this.customCoordinateSpaces.length + 1;
    let candidate = `Custom ${suffix}`;
    while (
      this.customCoordinateSpaces.some((space) => space.name === candidate)
    ) {
      suffix += 1;
      candidate = `Custom ${suffix}`;
    }
    return candidate;
  }

  /**
   * Copies an updated custom space onto all profiles that use its id.
   * @param space Updated custom coordinate space.
   */
  private syncProfilesUsingCoordinateSpace(
    space: CoordinateSpaceDefinition
  ): void {
    this.profiles.forEach((profile) => {
      if (profile.coordinateSpace.presetId === space.presetId) {
        profile.coordinateSpace = cloneCoordinateSpace(space);
      }
    });
  }

  /**
   * Builds a unique default name for a newly added profile.
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

  /**
   * Ensures the active id still points at an existing profile after deletion.
   */
  private ensureActiveProfileAfterRemoval(): void {
    const stillActive = this.profiles.some(
      (profile) => profile.id === this.activeGameProfileId
    );
    if (!stillActive) {
      this.activeGameProfileId = this.profiles[0]?.id ?? null;
    }
  }

  /**
   * Writes all game profiles through the repository.
   */
  private persistProfiles(): void {
    this.repository.saveAll(this.profiles, this.activeGameProfileId);
  }

  /**
   * Writes custom coordinate space presets to storage.
   */
  private persistCustomCoordinateSpaces(): void {
    this.coordinateSpaceRepository.saveAll(this.customCoordinateSpaces);
  }

  /**
   * Writes view settings to storage.
   */
  private persistViewSettings(): void {
    this.storage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(this.view));
  }

  /** Writes keyboard shortcut settings to storage. */
  private persistKeyboardShortcutSettings(): void {
    this.storage.setItem(
      KEYBOARD_SHORTCUTS_STORAGE_KEY,
      JSON.stringify(this.keyboard)
    );
  }

  /**
   * Loads view settings from storage with defaults for missing fields.
   * @returns Loaded view settings.
   */
  private loadViewSettings(): ViewSettings {
    const defaults = createDefaultViewSettings();
    const raw = this.storage.getItem(VIEW_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    return mergeViewSettings(defaults, raw);
  }

  /**
   * Loads keyboard shortcut settings and fills missing values with defaults.
   * @returns Valid keyboard shortcut settings.
   */
  private loadKeyboardShortcutSettings(): KeyboardShortcutSettings {
    const defaults = createDefaultKeyboardShortcutSettings();
    const raw = this.storage.getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY);
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw) as Partial<KeyboardShortcutSettings>;
      return {
        move: sanitizeKeyboardShortcut(parsed.move, defaults.move),
        rotate: sanitizeKeyboardShortcut(parsed.rotate, defaults.rotate),
        scale: sanitizeKeyboardShortcut(parsed.scale, defaults.scale),
        bounds: sanitizeKeyboardShortcut(parsed.bounds, defaults.bounds),
        face: sanitizeKeyboardShortcut(parsed.face, defaults.face),
        selection_object: sanitizeKeyboardShortcut(parsed.selection_object, defaults.selection_object),
        delete_selected: sanitizeKeyboardShortcut(parsed.delete_selected, defaults.delete_selected),
        escape: sanitizeKeyboardShortcut(parsed.escape, defaults.escape),
        save: sanitizeKeyboardShortcut(parsed.save, defaults.save),
        load: sanitizeKeyboardShortcut(parsed.load, defaults.load),
        export_glb: sanitizeKeyboardShortcut(parsed.export_glb, defaults.export_glb),
        undo: sanitizeKeyboardShortcut(parsed.undo, defaults.undo),
        redo: sanitizeKeyboardShortcut(parsed.redo, defaults.redo),
        redo_alternate: sanitizeKeyboardShortcut(parsed.redo_alternate, defaults.redo_alternate),
        duplicate: sanitizeKeyboardShortcut(parsed.duplicate, defaults.duplicate),
        group: sanitizeKeyboardShortcut(parsed.group, defaults.group),
        ungroup: sanitizeKeyboardShortcut(parsed.ungroup, defaults.ungroup),
        align_origin: sanitizeKeyboardShortcut(parsed.align_origin, defaults.align_origin),
        axis_cycle: sanitizeKeyboardShortcut(parsed.axis_cycle, defaults.axis_cycle),
        fit_selection: sanitizeKeyboardShortcut(parsed.fit_selection, defaults.fit_selection),
        fit_all: sanitizeKeyboardShortcut(parsed.fit_all, defaults.fit_all),
        shading_solid: sanitizeKeyboardShortcut(parsed.shading_solid, defaults.shading_solid),
        shading_wireframe: sanitizeKeyboardShortcut(parsed.shading_wireframe, defaults.shading_wireframe),
        shading_flat: sanitizeKeyboardShortcut(parsed.shading_flat, defaults.shading_flat),
        shading_wireframe_overlay: sanitizeKeyboardShortcut(parsed.shading_wireframe_overlay, defaults.shading_wireframe_overlay),
        snap_forward: sanitizeKeyboardShortcut(parsed.snap_forward, defaults.snap_forward),
        snap_backward: sanitizeKeyboardShortcut(parsed.snap_backward, defaults.snap_backward),
        snap_forward_large: sanitizeKeyboardShortcut(parsed.snap_forward_large, defaults.snap_forward_large),
        snap_backward_large: sanitizeKeyboardShortcut(parsed.snap_backward_large, defaults.snap_backward_large),
        extrude: sanitizeKeyboardShortcut(parsed.extrude, defaults.extrude),
        clip_flip: sanitizeKeyboardShortcut(parsed.clip_flip, defaults.clip_flip),
        clip_commit: sanitizeKeyboardShortcut(parsed.clip_commit, defaults.clip_commit),
        clip_split: sanitizeKeyboardShortcut(parsed.clip_split, defaults.clip_split)
      };
    } catch {
      return defaults;
    }
  }

  /**
   * Notifies all subscribers with a fresh snapshot.
   */
  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

/**
 * Deep-clones a game profile object.
 * @param profile Source profile.
 * @returns Cloned profile.
 */
function cloneProfile(profile: GameProfile): GameProfile {
  return {
    id: profile.id,
    name: profile.name,
    unitSystem: profile.unitSystem,
    metricUnit: profile.metricUnit,
    imperialUnit: profile.imperialUnit,
    coordinateSpace: cloneCoordinateSpace(
      profile.coordinateSpace ?? createDefaultCoordinateSpace()
    )
  };
}

/**
 * Clamps a number into an inclusive range.
 * @param value Input value.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @returns Clamped number.
 */
function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Merges stored view JSON over defaults with validation.
 * @param defaults Default view settings.
 * @param raw JSON text from storage.
 * @returns Merged view settings.
 */
function mergeViewSettings(defaults: ViewSettings, raw: string): ViewSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<ViewSettings>;
    return {
      theme: sanitizeTheme(parsed.theme, defaults.theme),
      brightness: clampNumber(
        Number(parsed.brightness ?? defaults.brightness),
        BRIGHTNESS_MIN,
        BRIGHTNESS_MAX
      ),
      materialBrowserIconSizePercent: clampNumber(
        Number(
          parsed.materialBrowserIconSizePercent ??
            defaults.materialBrowserIconSizePercent
        ),
        25,
        300
      ),
      rendererFontSize: clampNumber(
        Math.round(Number(parsed.rendererFontSize ?? defaults.rendererFontSize)),
        RENDERER_FONT_SIZE_MIN,
        RENDERER_FONT_SIZE_MAX
      ),
      viewportPaneCount: clampNumber(
        Math.round(Number(parsed.viewportPaneCount ?? defaults.viewportPaneCount)),
        1,
        4
      ) as ViewportPaneCount
    };
  } catch {
    return defaults;
  }
}

/**
 * Validates a stored theme preference.
 * @param value Candidate theme.
 * @param fallback Default theme.
 * @returns Safe theme preference.
 */
function sanitizeTheme(
  value: unknown,
  fallback: UiThemePreference
): UiThemePreference {
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value;
  }
  return fallback;
}

/**
 * Accepts browser keyboard event codes suitable for a primary shortcut.
 * @param value Candidate keyboard event code.
 * @returns True when the value is a non-empty keyboard event code.
 */
function isKeyboardEventCode(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 64;
}

/**
 * Validates a stored keyboard event code with a fallback.
 * @param value Candidate stored event code.
 * @param fallback Safe default event code.
 * @returns A valid event code.
 */
function sanitizeKeyboardShortcut(
  value: unknown,
  fallback: KeyboardShortcut
): KeyboardShortcut {
  if (typeof value === 'string' && isKeyboardEventCode(value)) {
    return { ...fallback, code: value };
  }
  if (!isValidKeyboardShortcut(value)) return { ...fallback };
  return { ...value };
}

/**
 * Checks whether a candidate is a valid keyboard shortcut.
 * @param value Candidate shortcut value.
 * @returns True when the candidate can be stored.
 */
function isValidKeyboardShortcut(value: unknown): value is KeyboardShortcut {
  if (!value || typeof value !== 'object') return false;
  const shortcut = value as KeyboardShortcut;
  return isKeyboardEventCode(shortcut.code) &&
    typeof shortcut.ctrl === 'boolean' && typeof shortcut.shift === 'boolean' &&
    typeof shortcut.alt === 'boolean' && typeof shortcut.meta === 'boolean';
}

/**
 * Checks whether two shortcut bindings have the same key and modifiers.
 * @param first First shortcut.
 * @param second Second shortcut.
 * @returns True when the shortcuts match exactly.
 */
function areShortcutsEqual(first: KeyboardShortcut, second: KeyboardShortcut): boolean {
  return first.code === second.code && first.ctrl === second.ctrl &&
    first.shift === second.shift && first.alt === second.alt && first.meta === second.meta;
}
