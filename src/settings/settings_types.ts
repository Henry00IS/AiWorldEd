import type { CoordinateSpaceDefinition } from './coordinate_space_types.js';
import type { ImperialUnit, MetricUnit, UnitSystem } from './unit_presets.js';

/** Settings dialog tab identifiers. */
export type SettingsTabId = 'games' | 'view' | 'mouse' | 'keyboard' | 'update';

/** Ordered settings tabs shown in the dialog. */
export const SETTINGS_TAB_ORDER: readonly SettingsTabId[] = Object.freeze([
  'games',
  'view',
  'mouse',
  'keyboard',
  'update',
]);

/** Display labels for settings tabs. */
export const SETTINGS_TAB_LABELS: Readonly<Record<SettingsTabId, string>> = Object.freeze({
  games: 'Games',
  view: 'View',
  mouse: 'Mouse',
  keyboard: 'Keyboard',
  update: 'Update',
});

/**
 * UI theme preference for the editor chrome and viewports. System follows the
 * OS color scheme.
 */
export type UiThemePreference = 'system' | 'light' | 'dark';

/** Number of editor viewports visible in the workspace. */
export type ViewportPaneCount = 1 | 2 | 3 | 4;

/** Ordered viewport pane count options shown in View preferences. */
export const VIEWPORT_PANE_COUNT_OPTIONS: readonly ViewportPaneCount[] = Object.freeze([1, 2, 3, 4]);

/** Theme preference labels for dropdowns. */
export const UI_THEME_LABELS: Readonly<Record<UiThemePreference, string>> = Object.freeze({
  system: 'System',
  light: 'Light',
  dark: 'Dark',
});

/** Ordered theme options. */
export const UI_THEME_OPTIONS: readonly UiThemePreference[] = Object.freeze(['system', 'light', 'dark']);

/**
 * Content texture sampling mode. Point uses nearest sampling; bilinear and
 * trilinear use linear magnification with mipmaps.
 */
export type TextureFilterMode = 'point' | 'bilinear' | 'trilinear';

/** Ordered texture filter modes shown in View preferences. */
export const TEXTURE_FILTER_MODE_OPTIONS: readonly TextureFilterMode[] = Object.freeze([
  'trilinear',
  'bilinear',
  'point',
]);

/** Display labels for texture filter modes. */
export const TEXTURE_FILTER_MODE_LABELS: Readonly<Record<TextureFilterMode, string>> = Object.freeze({
  trilinear: 'Smooth (Trilinear)',
  bilinear: 'Bilinear',
  point: 'Point (Nearest)',
});

/**
 * Anisotropic filtering preference for content maps. Maximum uses the GPU
 * reported cap at runtime.
 */
export type AnisotropyPreference = 'off' | '2x' | '4x' | '8x' | '16x' | 'max';

/** Ordered anisotropy options shown in View preferences. */
export const ANISOTROPY_PREFERENCE_OPTIONS: readonly AnisotropyPreference[] = Object.freeze([
  'max',
  '16x',
  '8x',
  '4x',
  '2x',
  'off',
]);

/** Display labels for anisotropy preferences. */
export const ANISOTROPY_PREFERENCE_LABELS: Readonly<Record<AnisotropyPreference, string>> = Object.freeze({
  max: 'Maximum',
  '16x': '16×',
  '8x': '8×',
  '4x': '4×',
  '2x': '2×',
  off: 'Off',
});

/** Serializable game profile stored as one JSON document per profile. */
export interface GameProfile {
  id: string;
  name: string;
  unitSystem: UnitSystem;
  metricUnit: MetricUnit;
  imperialUnit: ImperialUnit;
  /** Coordinate space preset (built-in engine or custom). */
  coordinateSpace: CoordinateSpaceDefinition;
}

/** View tab preferences for UI, material browser, fonts, and textures. */
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
  /** Sampling mode for content surface maps. */
  textureFilterMode: TextureFilterMode;
  /** Anisotropic filtering preference for content surface maps. */
  anisotropyPreference: AnisotropyPreference;
  /** Shows text beside quick-access icons when the top toolbar is expanded. */
  toolbarButtonLabels: boolean;
}

/** Settings that control mouse-driven viewport navigation. */
export interface MouseChordBinding {
  button: number;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** Settings that control mouse-driven viewport navigation. */
export interface MouseSettings {
  orbitSensitivity: number;
  orbitInvertYAxis: boolean;
  orbitBinding: MouseChordBinding;
  lookSensitivity: number;
  lookInvertXAxis: boolean;
  lookInvertYAxis: boolean;
  panSensitivity: number;
  panInvertXAxis: boolean;
  panInvertYAxis: boolean;
  moveSpeed: number;
  moveSensitivity: number;
  invertMouseWheel: boolean;
  altMiddleMouseDragMovesCamera: boolean;
  invertAltMiddleMouseDragZAxis: boolean;
  moveCameraTowardsCursor: boolean;
}

/** Preferences controlling when the standalone updater checks for releases. */
export interface UpdateSettings {
  automaticChecks: boolean;
}

/** Actions whose primary keyboard shortcut can be configured by the user. */
export type KeyboardShortcutAction =
  | 'move'
  | 'rotate'
  | 'scale'
  | 'bounds'
  | 'face'
  | 'selection_object'
  | 'delete_selected'
  | 'escape'
  | 'save'
  | 'load'
  | 'export_glb'
  | 'undo'
  | 'redo'
  | 'redo_alternate'
  | 'duplicate'
  | 'group'
  | 'ungroup'
  | 'align_origin'
  | 'axis_cycle'
  | 'fit_selection'
  | 'fit_all'
  | 'shading_solid'
  | 'shading_wireframe'
  | 'shading_flat'
  | 'shading_wireframe_overlay'
  | 'snap_forward'
  | 'snap_backward'
  | 'snap_forward_large'
  | 'snap_backward_large'
  | 'extrude'
  | 'clip_flip'
  | 'clip_commit'
  | 'clip_split';

/** Keyboard code and modifier state for one configured shortcut. */
export interface KeyboardShortcut {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** Keyboard event codes assigned to editor actions. */
export type KeyboardShortcutSettings = Record<KeyboardShortcutAction, KeyboardShortcut>;

/** Full editor settings snapshot persisted by the settings store. */
export interface EditorSettingsSnapshot {
  activeGameProfileId: string | null;
  gameProfiles: GameProfile[];
  /** User-authored coordinate space presets available across profiles. */
  customCoordinateSpaces: CoordinateSpaceDefinition[];
  view: ViewSettings;
  mouse: MouseSettings;
  update: UpdateSettings;
  keyboard: KeyboardShortcutSettings;
}

/** Inclusive minimum mouse navigation sensitivity. */
export const MOUSE_SENSITIVITY_MIN = 1;

/** Inclusive maximum mouse navigation sensitivity. */
export const MOUSE_SENSITIVITY_MAX = 100;

/** Inclusive minimum 3D fly movement speed. */
export const MOUSE_MOVE_SPEED_MIN = 1;

/** Inclusive maximum 3D fly movement speed. */
export const MOUSE_MOVE_SPEED_MAX = 20;

/** Material browser icon size choices as percent strings for dropdowns. */
export const MATERIAL_BROWSER_ICON_SIZE_OPTIONS: readonly number[] = Object.freeze([
  25, 50, 75, 100, 125, 150, 175, 200, 250, 300,
]);

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
 *
 * @returns Integer sizes from 8 through 72.
 */
export function buildRendererFontSizeOptions(): number[] {
  const sizes: number[] = [];
  for (let size = RENDERER_FONT_SIZE_MIN; size <= RENDERER_FONT_SIZE_MAX; size++) {
    sizes.push(size);
  }
  return sizes;
}
