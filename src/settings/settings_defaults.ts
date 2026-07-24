import { createDefaultCoordinateSpace } from './coordinate_space_presets.js';
import type {
  GameProfile,
  KeyboardShortcutSettings,
  ViewSettings
} from './settings_types.js';

/** Default game profile display name. */
export const DEFAULT_GAME_PROFILE_NAME = 'Default';

/**
 * Creates a fresh default game profile with metric meters and Godot axes.
 * @param id Stable unique identifier for the profile.
 * @param name Optional display name.
 * @returns New game profile object.
 */
export function createDefaultGameProfile(
  id: string,
  name: string = DEFAULT_GAME_PROFILE_NAME
): GameProfile {
  return {
    id,
    name,
    unitSystem: 'metric',
    metricUnit: 'meter',
    imperialUnit: 'foot',
    coordinateSpace: createDefaultCoordinateSpace()
  };
}

/**
 * Returns default View tab settings.
 * @returns Fresh view settings snapshot.
 */
export function createDefaultViewSettings(): ViewSettings {
  return {
    theme: 'dark',
    brightness: 100,
    materialBrowserIconSizePercent: 100,
    rendererFontSize: 13,
    viewportPaneCount: 4
  };
}

/**
 * Returns default Keyboard tab bindings.
 * @returns Fresh keyboard shortcut settings snapshot.
 */
export function createDefaultKeyboardShortcutSettings(): KeyboardShortcutSettings {
  return {
    move: createShortcut('KeyW'), rotate: createShortcut('KeyE'),
    scale: createShortcut('KeyR'), bounds: createShortcut('KeyT'),
    face: createShortcut('Tab', false, true), selection_object: createShortcut('Tab'), delete_selected: createShortcut('Delete'),
    escape: createShortcut('Escape'), save: createShortcut('KeyS', true),
    load: createShortcut('KeyO', true), export_glb: createShortcut('KeyE', true, true),
    undo: createShortcut('KeyZ', true), redo: createShortcut('KeyY', true), redo_alternate: createShortcut('KeyZ', true, true),
    duplicate: createShortcut('KeyD', true), group: createShortcut('KeyG', false, true),
    ungroup: createShortcut('KeyU', false, true), align_origin: createShortcut('KeyG', false, false, true),
    axis_cycle: createShortcut('KeyA'), fit_selection: createShortcut('KeyF'),
    fit_all: createShortcut('KeyF', false, true), shading_solid: createShortcut('Digit1'),
    shading_wireframe: createShortcut('Digit2'), shading_flat: createShortcut('Digit3'),
    shading_wireframe_overlay: createShortcut('Digit4'), snap_forward: createShortcut('Period'),
    snap_backward: createShortcut('Comma'), snap_forward_large: createShortcut('Period', false, true), snap_backward_large: createShortcut('Comma', false, true), extrude: createShortcut('KeyE', false, true),
    clip_flip: createShortcut('KeyF'), clip_commit: createShortcut('Enter'),
    clip_split: createShortcut('KeyX')
  };
}

/**
 * Builds a keyboard shortcut binding.
 * @param code KeyboardEvent.code value.
 * @param ctrl Whether Control is required.
 * @param shift Whether Shift is required.
 * @param alt Whether Alt is required.
 * @param meta Whether Meta is required.
 * @returns Shortcut binding.
 */
function createShortcut(
  code: string,
  ctrl: boolean = false,
  shift: boolean = false,
  alt: boolean = false,
  meta: boolean = false
): KeyboardShortcutSettings[keyof KeyboardShortcutSettings] {
  return { code, ctrl, shift, alt, meta };
}
