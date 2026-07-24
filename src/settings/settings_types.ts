import type { CoordinateSpaceDefinition } from './coordinate_space_types.js';
import type { ImperialUnit, MetricUnit, UnitSystem } from './unit_presets.js';

/**
 * Settings dialog tab identifiers.
 */
export type SettingsTabId =
  | 'games'
  | 'view'
  | 'themes'
  | 'mouse'
  | 'keyboard'
  | 'update';

/** Ordered settings tabs shown in the dialog. */
export const SETTINGS_TAB_ORDER: readonly SettingsTabId[] = Object.freeze([
  'games',
  'view',
  'themes',
  'mouse',
  'keyboard',
  'update'
]);

/** Display labels for settings tabs. */
export const SETTINGS_TAB_LABELS: Readonly<Record<SettingsTabId, string>> =
  Object.freeze({
    games: 'Games',
    view: 'View',
    themes: 'Themes',
    mouse: 'Mouse',
    keyboard: 'Keyboard',
    update: 'Update'
  });

/**
 * UI theme preference for the editor chrome and viewports.
 * System follows the OS color scheme.
 */
export type UiThemePreference = 'system' | 'light' | 'dark';

/** Number of editor viewports visible in the workspace. */
export type ViewportPaneCount = 1 | 2 | 3 | 4;

/** Ordered viewport pane count options shown in View preferences. */
export const VIEWPORT_PANE_COUNT_OPTIONS: readonly ViewportPaneCount[] =
  Object.freeze([1, 2, 3, 4]);

/** Theme preference labels for dropdowns. */
export const UI_THEME_LABELS: Readonly<Record<UiThemePreference, string>> =
  Object.freeze({
    system: 'System',
    light: 'Light',
    dark: 'Dark'
  });

/** Ordered theme options. */
export const UI_THEME_OPTIONS: readonly UiThemePreference[] = Object.freeze([
  'system',
  'light',
  'dark'
]);

/**
 * Serializable game profile stored as one JSON document per profile.
 */
export interface GameProfile {
  id: string;
  name: string;
  unitSystem: UnitSystem;
  metricUnit: MetricUnit;
  imperialUnit: ImperialUnit;
  /** Coordinate space preset (built-in engine or custom). */
  coordinateSpace: CoordinateSpaceDefinition;
}

/**
 * View tab preferences for UI, material browser, and fonts.
 */
export interface ViewSettings {
  theme: UiThemePreference;
  /** Viewport texture/material brightness percent (0–200). */
  brightness: number;
  /** Material browser icon preview scale percent (25–300). */
  materialBrowserIconSizePercent: number;
  /** Program UI font size in pixels (8–72). */
  rendererFontSize: number;
  /** Number of viewport panes visible in the editor workspace. */
  viewportPaneCount: ViewportPaneCount;
}

/**
 * Full editor settings snapshot persisted by the settings store.
 */
export interface EditorSettingsSnapshot {
  activeGameProfileId: string | null;
  gameProfiles: GameProfile[];
  /** User-authored coordinate space presets available across profiles. */
  customCoordinateSpaces: CoordinateSpaceDefinition[];
  view: ViewSettings;
}

/**
 * Material browser icon size choices as percent strings for dropdowns.
 */
export const MATERIAL_BROWSER_ICON_SIZE_OPTIONS: readonly number[] =
  Object.freeze([25, 50, 75, 100, 125, 150, 175, 200, 250, 300]);

/** Inclusive minimum renderer font size. */
export const RENDERER_FONT_SIZE_MIN = 8;

/** Inclusive maximum renderer font size. */
export const RENDERER_FONT_SIZE_MAX = 72;

/** Inclusive minimum brightness percent. */
export const BRIGHTNESS_MIN = 0;

/** Inclusive maximum brightness percent. */
export const BRIGHTNESS_MAX = 200;

/**
 * Builds the ordered list of renderer font sizes for dropdowns.
 * @returns Integer sizes from 8 through 72.
 */
export function buildRendererFontSizeOptions(): number[] {
  const sizes: number[] = [];
  for (let size = RENDERER_FONT_SIZE_MIN; size <= RENDERER_FONT_SIZE_MAX; size++) {
    sizes.push(size);
  }
  return sizes;
}
