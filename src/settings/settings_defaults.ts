import { createDefaultCoordinateSpace } from './coordinate_space_presets.js';
import type {
  GameProfile,
  KeyboardShortcutSettings,
  MouseSettings,
  UpdateSettings,
  ViewSettings,
} from './settings_types.js';

/** Default game profile display name. */
export const DEFAULT_GAME_PROFILE_NAME = 'Default';

/**
 * Creates a fresh default game profile with metric meters and Godot axes.
 *
 * @param id Stable unique identifier for the profile.
 * @param name Optional display name.
 * @returns New game profile object.
 */
export function createDefaultGameProfile(id: string, name: string = DEFAULT_GAME_PROFILE_NAME): GameProfile {
  return {
    id,
    name,
    unitSystem: 'metric',
    metricUnit: 'meter',
    imperialUnit: 'foot',
    coordinateSpace: createDefaultCoordinateSpace(),
  };
}

/**
 * Returns default View tab settings.
 *
 * @returns Fresh view settings snapshot.
 */
export function createDefaultViewSettings(): ViewSettings {
  return {
    theme: 'dark',
    brightness: 100,
    materialBrowserIconSizePercent: 100,
    rendererFontSize: 13,
    viewportPaneCount: 4,
    textureFilterMode: 'trilinear',
    anisotropyPreference: 'max',
    toolbarButtonLabels: true,
  };
}

/**
 * Returns default Mouse tab navigation settings.
 *
 * @returns Fresh mouse settings snapshot.
 */
export function createDefaultMouseSettings(): MouseSettings {
  return {
    orbitSensitivity: 50,
    orbitInvertYAxis: true,
    orbitBinding: { button: 0, ctrl: true, shift: false, alt: true, meta: false },
    lookSensitivity: 50,
    lookInvertXAxis: false,
    lookInvertYAxis: false,
    panSensitivity: 50,
    panInvertXAxis: false,
    panInvertYAxis: false,
    moveSpeed: 5,
    moveSensitivity: 30,
    invertMouseWheel: false,
    altMiddleMouseDragMovesCamera: false,
    invertAltMiddleMouseDragZAxis: false,
    moveCameraTowardsCursor: false,
  };
}

/** Returns default standalone updater preferences. */
export function createDefaultUpdateSettings(): UpdateSettings {
  return { automaticChecks: false };
}

/**
 * Returns default Keyboard tab bindings.
 *
 * @returns Fresh keyboard shortcut settings snapshot.
 */
export function createDefaultKeyboardShortcutSettings(): KeyboardShortcutSettings {
  return {
    ...createDefaultTransformShortcuts(),
    ...createDefaultEditFileShortcuts(),
    ...createDefaultNavigationShortcuts(),
    ...createDefaultShadingSnapClipShortcuts(),
  };
}

/**
 * Default transform-mode and selection-mode shortcuts.
 *
 * @returns Partial keyboard shortcut settings.
 */
function createDefaultTransformShortcuts(): Pick<
  KeyboardShortcutSettings,
  'move' | 'rotate' | 'scale' | 'bounds' | 'face' | 'selection_object'
> {
  return {
    move: createShortcut('KeyW'),
    rotate: createShortcut('KeyE'),
    scale: createShortcut('KeyR'),
    bounds: createShortcut('KeyT'),
    face: createShortcut('Tab', false, true),
    selection_object: createShortcut('Tab'),
  };
}

/**
 * Default edit and file operation shortcuts.
 *
 * @returns Partial keyboard shortcut settings.
 */
function createDefaultEditFileShortcuts(): Pick<
  KeyboardShortcutSettings,
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
> {
  return {
    delete_selected: createShortcut('Delete'),
    escape: createShortcut('Escape'),
    save: createShortcut('KeyS', true),
    load: createShortcut('KeyO', true),
    export_glb: createShortcut('KeyE', true, true),
    undo: createShortcut('KeyZ', true),
    redo: createShortcut('KeyY', true),
    redo_alternate: createShortcut('KeyZ', true, true),
    duplicate: createShortcut('KeyD', true),
    group: createShortcut('KeyG', false, true),
    ungroup: createShortcut('KeyU', false, true),
  };
}

/**
 * Default camera fit and alignment shortcuts.
 *
 * @returns Partial keyboard shortcut settings.
 */
function createDefaultNavigationShortcuts(): Pick<
  KeyboardShortcutSettings,
  'align_origin' | 'axis_cycle' | 'fit_selection' | 'fit_all'
> {
  return {
    align_origin: createShortcut('KeyG', false, false, true),
    axis_cycle: createShortcut('KeyA'),
    fit_selection: createShortcut('KeyF'),
    fit_all: createShortcut('KeyF', false, true),
  };
}

/**
 * Default shading, snap, extrude, and clip shortcuts.
 *
 * @returns Partial keyboard shortcut settings.
 */
function createDefaultShadingSnapClipShortcuts(): Pick<
  KeyboardShortcutSettings,
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
  | 'clip_split'
> {
  return {
    shading_solid: createShortcut('Digit1'),
    shading_wireframe: createShortcut('Digit2'),
    shading_flat: createShortcut('Digit3'),
    shading_wireframe_overlay: createShortcut('Digit4'),
    snap_forward: createShortcut('Period'),
    snap_backward: createShortcut('Comma'),
    snap_forward_large: createShortcut('Period', false, true),
    snap_backward_large: createShortcut('Comma', false, true),
    extrude: createShortcut('KeyE', false, true),
    clip_flip: createShortcut('KeyF'),
    clip_commit: createShortcut('Enter'),
    clip_split: createShortcut('KeyX'),
  };
}

/**
 * Builds a keyboard shortcut binding.
 *
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
  meta: boolean = false,
): KeyboardShortcutSettings[keyof KeyboardShortcutSettings] {
  return { code, ctrl, shift, alt, meta };
}
