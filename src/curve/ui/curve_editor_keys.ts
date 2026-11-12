import type { CurveSegmentMode } from '@/curve/model/curve_model.js';
import type { CurveEditorSession } from './curve_editor_session.js';

/** View actions shortcuts can trigger. */
export interface CurveEditorKeyView {
  /** Fits the curve into view. */
  frameAll: () => void;
  /** Turns the view. */
  rotate: () => void;
  /** Steps back in the edited value's history. */
  undo: () => void;
  /** Steps forward in the edited value's history. */
  redo: () => void;
}

/** Number keys that set the active segment's mode. */
const CURVE_EDITOR_MODE_KEYS: Readonly<Record<string, CurveSegmentMode>> = {
  Digit1: 'linear',
  Digit2: 'quadratic',
  Digit3: 'bezier',
};

/**
 * Runs the curve editor shortcut of a key press: Delete removes the selected
 * points, Ctrl+A selects every point, S cycles the section type, Ctrl+Z /
 * Ctrl+Y undo and redo on the edited value's history, F frames, R rotates, 1-3
 * set the segment mode and Tab switches between the main profile and the
 * secondary line.
 *
 * @param event Key press.
 * @param session Editing session.
 * @param view View actions.
 * @returns True when the key did something.
 */
export function curveEditorKeyAction(
  event: KeyboardEvent,
  session: CurveEditorSession,
  view: CurveEditorKeyView,
): boolean {
  const action = curveEditorKeyFind(event, session, view);
  action?.();
  return action !== null;
}

/**
 * Finds the action of a key press.
 *
 * @param event Key press.
 * @param session Editing session.
 * @param view View actions.
 * @returns Action, or null for keys without one.
 */
function curveEditorKeyFind(
  event: KeyboardEvent,
  session: CurveEditorSession,
  view: CurveEditorKeyView,
): (() => void) | null {
  const command = event.ctrlKey || event.metaKey;
  if (command && event.code === 'KeyZ') return event.shiftKey ? view.redo : view.undo;
  if (command && event.code === 'KeyY') return view.redo;
  if (command && event.code === 'KeyA')
    return () =>
      session.selectPoints(
        session.curve.points.map((_, at) => at),
        'replace',
      );
  if (command || event.altKey) return null;
  if (event.key === 'Delete' || event.key === 'Backspace') return () => session.deleteSelected();
  if (event.code === 'KeyF') return view.frameAll;
  if (event.code === 'KeyR') return view.rotate;
  if (event.code === 'KeyS') return () => session.cycleSection();
  if (event.key === 'Tab' && session.layerAvailable()) return () => session.toggleLayer();
  const mode = CURVE_EDITOR_MODE_KEYS[event.code];
  return mode ? () => session.setMode(mode) : null;
}
