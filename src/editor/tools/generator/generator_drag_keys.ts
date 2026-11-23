import type { EditorWindow } from '@/editor/window/editor_window.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import type { PathEditSelectMode } from '@/path/edit/path_edit_selection.js';

/** Axis lock each axis key picks. */
const GENERATOR_DRAG_AXIS_KEYS: Readonly<
  Record<string, TransformModalAxis.X | TransformModalAxis.Y | TransformModalAxis.Z>
> = { KeyX: TransformModalAxis.X, KeyY: TransformModalAxis.Y, KeyZ: TransformModalAxis.Z };

/**
 * Returns whether Shift is held, which turns grid snapping the other way round
 * during a drag.
 *
 * @param editor Editor window.
 * @returns True while Shift is held.
 */
export function generatorShiftHeld(editor: EditorWindow): boolean {
  return editor.getLatchedModifierFlags()?.shiftKey === true || editor.isShiftPressed;
}

/**
 * Returns how a press changes the selection, as in the curve editor: Ctrl or
 * Cmd toggles, Shift adds, and otherwise the press replaces it.
 *
 * @param editor Editor window.
 * @returns Selection mode.
 */
export function generatorSelectMode(editor: EditorWindow): PathEditSelectMode {
  if (editor.isCtrlPressed) return 'toggle';
  return generatorShiftHeld(editor) ? 'add' : 'replace';
}

/**
 * Returns the axis lock an axis key picks.
 *
 * @param keyCode Key code.
 * @returns X, Y or Z, or null for another key.
 */
export function generatorAxisKey(
  keyCode: string,
): TransformModalAxis.X | TransformModalAxis.Y | TransformModalAxis.Z | null {
  return GENERATOR_DRAG_AXIS_KEYS[keyCode] ?? null;
}

/**
 * Returns the world axis index of a locked axis.
 *
 * @param axis Axis lock.
 * @returns 0, 1 or 2, or null when no axis is locked.
 */
export function generatorAxisIndex(axis: TransformModalAxis): number | null {
  const index = [TransformModalAxis.X, TransformModalAxis.Y, TransformModalAxis.Z].indexOf(axis);
  return index < 0 ? null : index;
}
