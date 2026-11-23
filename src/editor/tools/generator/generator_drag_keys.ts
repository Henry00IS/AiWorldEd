import * as THREE from 'three';
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
  return editor.getLatchedModifierFlags()?.shiftKey ?? editor.isShiftPressed;
}

/**
 * Follows Shift during a drag, so pressing or letting go of it turns grid
 * snapping over at once, without waiting for the pointer to move.
 */
export class GeneratorShiftWatch {
  /** Window listened on, or null. */
  private target: Window | null = null;
  /** Editor whose modifiers follow Shift. */
  private editor: EditorWindow | null = null;
  /** Reacts to Shift going down or up. */
  private readonly listener = (event: KeyboardEvent): void => {
    if (event.key !== 'Shift' || !this.editor) return;
    this.editor.updateModifiersFromDomEvent(event);
    this.changed();
  };

  /**
   * Creates a watcher.
   *
   * @param changed Called after Shift goes down or up.
   */
  constructor(private readonly changed: () => void) {}

  /**
   * Starts following Shift in the window of a pane.
   *
   * @param editor Editor window.
   * @param ownerWindow Window of the dragged pane.
   */
  start(editor: EditorWindow, ownerWindow: Window | null): void {
    this.stop();
    this.editor = editor;
    this.target = ownerWindow;
    ownerWindow?.addEventListener('keydown', this.listener, true);
    ownerWindow?.addEventListener('keyup', this.listener, true);
  }

  /** Stops following Shift. */
  stop(): void {
    this.target?.removeEventListener('keydown', this.listener, true);
    this.target?.removeEventListener('keyup', this.listener, true);
    this.target = null;
    this.editor = null;
  }
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

/**
 * Returns the world direction of a locked axis turned by the orientation of the
 * axis locks.
 *
 * @param index Axis index: 0, 1 or 2.
 * @param orientation Rotation of the axis locks.
 * @returns Unit world direction.
 */
export function generatorAxisUnit(index: number, orientation: THREE.Quaternion): THREE.Vector3 {
  return new THREE.Vector3().setComponent(index, 1).applyQuaternion(orientation);
}
