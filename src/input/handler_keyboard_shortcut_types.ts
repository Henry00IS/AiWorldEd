import type { TransformMode } from '@/types/transform_mode.js';
import type { ShadingMode } from '@/types/shading_mode.js';
import type { SelectionMode } from '@/types/selection_mode.js';

/**
 * Callback for transform mode changes.
 *
 * @param mode The new transform mode to activate.
 */
export type TransformModeCallback = (mode: TransformMode) => void;

/** Callback for a generic action triggered by a keyboard shortcut. */
export type ActionCallback = () => void;

/**
 * Callback for a keyboard shortcut that needs the originating key event (for
 * example fit, which targets the window that received the key).
 *
 * @param event The keyboard event that matched the shortcut.
 */
export type KeyboardActionCallback = (event: KeyboardEvent) => void;

/**
 * Callback for shading mode changes.
 *
 * @param mode The new shading mode to apply.
 */
export type ShadingModeCallback = (mode: ShadingMode) => void;

/**
 * Callback for selection mode toggle.
 *
 * @param mode The new selection mode to activate.
 */
export type SelectionModeCallback = (mode: SelectionMode) => void;

/**
 * Optional guard that reports whether 3D fly navigation is active.
 *
 * @returns True when tool keys must be suppressed for fly mode.
 */
export type NavigationActiveCallback = () => boolean;

/**
 * Returns true when the event target is a text input that should own keys.
 *
 * @param event The keyboard event.
 * @returns True if shortcuts must not run.
 */
export function handlerKeyboardShortcutIsTypingInFormField(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return target.isContentEditable;
}

/** Input types that hold no typed text, so they have no text undo of their own. */
const HANDLER_KEYBOARD_SHORTCUT_UNTYPED_INPUTS = new Set(['checkbox', 'radio', 'range', 'color', 'button', 'submit']);

/**
 * Returns whether a focused form field leaves undo and redo to the editor: a
 * dropdown, a checkbox or similar control without typed text, or a text field
 * that marks itself idle (`data-typing="false"`) because nothing typed into it
 * awaits a commit.
 *
 * @param event The keyboard event.
 * @returns True when the editor's undo and redo shortcuts should run.
 */
export function handlerKeyboardShortcutFieldAllowsEditorUndo(event: KeyboardEvent): boolean {
  const target = event.target;
  if (target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return HANDLER_KEYBOARD_SHORTCUT_UNTYPED_INPUTS.has(target.type) || target.dataset['typing'] === 'false';
}
