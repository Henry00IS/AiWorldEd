import type { KeyboardShortcut, KeyboardShortcutSettings } from '@/settings/store/settings_types.js';

/** Ordered keyboard shortcut action keys for merge loops. */
const KEYBOARD_SHORTCUT_ACTIONS = [
  'move',
  'rotate',
  'scale',
  'bounds',
  'face',
  'selection_object',
  'interaction_mode',
  'delete_selected',
  'escape',
  'save',
  'load',
  'export_glb',
  'undo',
  'redo',
  'redo_alternate',
  'duplicate',
  'group',
  'ungroup',
  'align_origin',
  'solid_operation_toggle',
  'fit_selection',
  'fit_all',
  'shading_solid',
  'shading_wireframe',
  'shading_flat',
  'shading_wireframe_overlay',
  'snap_forward',
  'snap_backward',
  'snap_forward_large',
  'snap_backward_large',
  'extrude',
  'clip_flip',
  'clip_commit',
  'clip_split',
  'component_vertex',
  'component_edge',
  'component_face',
] as const satisfies ReadonlyArray<keyof KeyboardShortcutSettings>;

/**
 * Accepts browser keyboard event codes suitable for a primary shortcut.
 *
 * @param value Candidate keyboard event code.
 * @returns True when the value is a non-empty keyboard event code.
 */
export function isKeyboardEventCode(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 64;
}

/**
 * Checks whether a candidate is a valid keyboard shortcut.
 *
 * @param value Candidate shortcut value.
 * @returns True when the candidate can be stored.
 */
export function isValidKeyboardShortcut(value: unknown): value is KeyboardShortcut {
  if (!value || typeof value !== 'object') return false;
  const shortcut = value as KeyboardShortcut;
  return (
    isKeyboardEventCode(shortcut.code) &&
    typeof shortcut.ctrl === 'boolean' &&
    typeof shortcut.shift === 'boolean' &&
    typeof shortcut.alt === 'boolean' &&
    typeof shortcut.meta === 'boolean'
  );
}

/**
 * Validates a stored keyboard event code with a fallback.
 *
 * @param value Candidate stored event code.
 * @param fallback Safe default event code.
 * @returns A valid event code.
 */
export function sanitizeKeyboardShortcut(value: unknown, fallback: KeyboardShortcut): KeyboardShortcut {
  if (typeof value === 'string' && isKeyboardEventCode(value)) {
    return { ...fallback, code: value };
  }
  if (!isValidKeyboardShortcut(value)) return { ...fallback };
  return { ...value };
}

/**
 * Checks whether two shortcut bindings have the same key and modifiers.
 *
 * @param first First shortcut.
 * @param second Second shortcut.
 * @returns True when the shortcuts match exactly.
 */
export function areShortcutsEqual(first: KeyboardShortcut, second: KeyboardShortcut): boolean {
  return (
    first.code === second.code &&
    first.ctrl === second.ctrl &&
    first.shift === second.shift &&
    first.alt === second.alt &&
    first.meta === second.meta
  );
}

/**
 * Merges a partial keyboard shortcut map over defaults.
 *
 * @param defaults Safe default shortcuts.
 * @param parsed Partial stored shortcuts.
 * @returns Complete validated shortcut settings.
 */
export function mergeKeyboardShortcutSettings(
  defaults: KeyboardShortcutSettings,
  parsed: Partial<KeyboardShortcutSettings>,
): KeyboardShortcutSettings {
  const merged = { ...defaults };
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    merged[action] = sanitizeKeyboardShortcut(parsed[action], defaults[action]);
  }
  return merged;
}
