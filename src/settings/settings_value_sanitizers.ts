import type {
  AnisotropyPreference,
  MouseChordBinding,
  MouseSettings,
  TextureFilterMode,
  UiThemePreference,
  ViewportPaneCount,
  ViewSettings,
} from './settings_types.js';
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  MOUSE_MOVE_SPEED_MAX,
  MOUSE_MOVE_SPEED_MIN,
  MOUSE_SENSITIVITY_MAX,
  MOUSE_SENSITIVITY_MIN,
  RENDERER_FONT_SIZE_MAX,
  RENDERER_FONT_SIZE_MIN,
} from './settings_types.js';

/**
 * Clamps a number into an inclusive range.
 *
 * @param value Input value.
 * @param min Inclusive minimum.
 * @param max Inclusive maximum.
 * @returns Clamped number.
 */
export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Validates a stored theme preference.
 *
 * @param value Candidate theme.
 * @param fallback Default theme.
 * @returns Safe theme preference.
 */
export function sanitizeTheme(value: unknown, fallback: UiThemePreference): UiThemePreference {
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value;
  }
  return fallback;
}

/**
 * Validates a boolean preference.
 *
 * @param value Candidate value.
 * @param fallback Safe fallback value.
 * @returns Candidate when boolean; otherwise fallback.
 */
export function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Validates a texture filter mode preference.
 *
 * @param value Candidate mode.
 * @param fallback Default mode.
 * @returns Safe texture filter mode.
 */
export function sanitizeTextureFilterMode(value: unknown, fallback: TextureFilterMode): TextureFilterMode {
  if (value === 'point' || value === 'bilinear' || value === 'trilinear') {
    return value;
  }
  return fallback;
}

/**
 * Validates an anisotropic filtering preference.
 *
 * @param value Candidate preference.
 * @param fallback Default preference.
 * @returns Safe anisotropy preference.
 */
export function sanitizeAnisotropyPreference(value: unknown, fallback: AnisotropyPreference): AnisotropyPreference {
  if (value === 'off' || value === '2x' || value === '4x' || value === '8x' || value === '16x' || value === 'max') {
    return value;
  }
  return fallback;
}

/**
 * Validates a mouse sensitivity value.
 *
 * @param value Candidate value.
 * @param fallback Safe fallback value.
 * @returns Clamped integer sensitivity.
 */
export function sanitizeMouseSensitivity(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampNumber(Math.round(value), MOUSE_SENSITIVITY_MIN, MOUSE_SENSITIVITY_MAX);
}

/**
 * Validates a 3D fly movement speed value.
 *
 * @param value Candidate value.
 * @param fallback Safe fallback value.
 * @returns Clamped movement speed.
 */
export function sanitizeMouseMoveSpeed(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampNumber(value, MOUSE_MOVE_SPEED_MIN, MOUSE_MOVE_SPEED_MAX);
}

/**
 * Merges mouse settings candidates over safe defaults.
 *
 * @param defaults Existing safe mouse settings.
 * @param candidate Potentially partial stored or updated settings.
 * @returns Validated mouse settings.
 */
export function mergeMouseSettings(defaults: MouseSettings, candidate: Partial<MouseSettings>): MouseSettings {
  return {
    orbitSensitivity: sanitizeMouseSensitivity(candidate.orbitSensitivity, defaults.orbitSensitivity),
    orbitInvertYAxis: sanitizeBoolean(candidate.orbitInvertYAxis, defaults.orbitInvertYAxis),
    orbitBinding: sanitizeMouseChordBinding(candidate.orbitBinding, defaults.orbitBinding),
    lookSensitivity: sanitizeMouseSensitivity(candidate.lookSensitivity, defaults.lookSensitivity),
    lookInvertXAxis: sanitizeBoolean(candidate.lookInvertXAxis, defaults.lookInvertXAxis),
    lookInvertYAxis: sanitizeBoolean(candidate.lookInvertYAxis, defaults.lookInvertYAxis),
    panSensitivity: sanitizeMouseSensitivity(candidate.panSensitivity, defaults.panSensitivity),
    panInvertXAxis: sanitizeBoolean(candidate.panInvertXAxis, defaults.panInvertXAxis),
    panInvertYAxis: sanitizeBoolean(candidate.panInvertYAxis, defaults.panInvertYAxis),
    moveSpeed: sanitizeMouseMoveSpeed(candidate.moveSpeed, defaults.moveSpeed),
    moveSensitivity: sanitizeMouseSensitivity(candidate.moveSensitivity, defaults.moveSensitivity),
    invertMouseWheel: sanitizeBoolean(candidate.invertMouseWheel, defaults.invertMouseWheel),
    altMiddleMouseDragMovesCamera: sanitizeBoolean(
      candidate.altMiddleMouseDragMovesCamera,
      defaults.altMiddleMouseDragMovesCamera,
    ),
    invertAltMiddleMouseDragZAxis: sanitizeBoolean(
      candidate.invertAltMiddleMouseDragZAxis,
      defaults.invertAltMiddleMouseDragZAxis,
    ),
    moveCameraTowardsCursor: sanitizeBoolean(candidate.moveCameraTowardsCursor, defaults.moveCameraTowardsCursor),
  };
}

/**
 * Validates a persisted mouse chord.
 *
 * @param value Candidate binding.
 * @param fallback Safe default binding.
 * @returns Sanitized mouse chord.
 */
export function sanitizeMouseChordBinding(value: unknown, fallback: MouseChordBinding): MouseChordBinding {
  if (!value || typeof value !== 'object') return { ...fallback };
  const candidate = value as Partial<MouseChordBinding>;
  if (!Number.isInteger(candidate.button) || Number(candidate.button) < 0 || Number(candidate.button) > 4) {
    return { ...fallback };
  }
  return {
    button: Number(candidate.button),
    ctrl: sanitizeBoolean(candidate.ctrl, fallback.ctrl),
    shift: sanitizeBoolean(candidate.shift, fallback.shift),
    alt: sanitizeBoolean(candidate.alt, fallback.alt),
    meta: sanitizeBoolean(candidate.meta, fallback.meta),
  };
}

/**
 * Checks whether two mouse settings snapshots are identical.
 *
 * @param first First settings snapshot.
 * @param second Second settings snapshot.
 * @returns True when every preference matches.
 */
export function areMouseSettingsEqual(first: MouseSettings, second: MouseSettings): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/**
 * Merges a parsed partial view object over defaults with validation.
 *
 * @param defaults Default view settings.
 * @param parsed Partial stored view fields.
 * @returns Merged view settings.
 */
export function mergeParsedViewSettings(defaults: ViewSettings, parsed: Partial<ViewSettings>): ViewSettings {
  return {
    theme: sanitizeTheme(parsed.theme, defaults.theme),
    brightness: clampNumber(Number(parsed.brightness ?? defaults.brightness), BRIGHTNESS_MIN, BRIGHTNESS_MAX),
    materialBrowserIconSizePercent: clampNumber(
      Number(parsed.materialBrowserIconSizePercent ?? defaults.materialBrowserIconSizePercent),
      25,
      300,
    ),
    rendererFontSize: clampNumber(
      Math.round(Number(parsed.rendererFontSize ?? defaults.rendererFontSize)),
      RENDERER_FONT_SIZE_MIN,
      RENDERER_FONT_SIZE_MAX,
    ),
    viewportPaneCount: clampNumber(
      Math.round(Number(parsed.viewportPaneCount ?? defaults.viewportPaneCount)),
      1,
      4,
    ) as ViewportPaneCount,
    textureFilterMode: sanitizeTextureFilterMode(parsed.textureFilterMode, defaults.textureFilterMode),
    anisotropyPreference: sanitizeAnisotropyPreference(parsed.anisotropyPreference, defaults.anisotropyPreference),
    toolbarButtonLabels:
      typeof parsed.toolbarButtonLabels === 'boolean' ? parsed.toolbarButtonLabels : defaults.toolbarButtonLabels,
  };
}

/**
 * Merges stored view JSON over defaults with validation.
 *
 * @param defaults Default view settings.
 * @param raw JSON text from storage.
 * @returns Merged view settings.
 */
export function mergeViewSettings(defaults: ViewSettings, raw: string): ViewSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<ViewSettings>;
    return mergeParsedViewSettings(defaults, parsed);
  } catch {
    return defaults;
  }
}
