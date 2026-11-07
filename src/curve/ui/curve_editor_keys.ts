import type { CurveSegmentMode } from '@/curve/model/curve_model.js';
import type { CurveEditorSession } from './curve_editor_session.js';

/** View actions shortcuts can trigger. */
export interface CurveEditorKeyView {
  /** Fits the curve into view. */
  frameAll: () => void;
  /** Turns the view. */
  rotate: () => void;
}

/** Number keys that set the active segment's mode. */
const CURVE_EDITOR_MODE_KEYS: Readonly<Record<string, CurveSegmentMode>> = {
  Digit1: 'linear',
  Digit2: 'quadratic',
  Digit3: 'bezier',
};

/**
 * Runs the curve editor shortcut of a key press: Delete removes the selected
 * points, Ctrl+A selects every point, Ctrl+Z / Ctrl+Y undo and redo locally, F
 * frames, R rotates and 1-3 set the segment mode.
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
  if (command && event.code === 'KeyZ') return event.shiftKey ? () => session.redo() : () => session.undo();
  if (command && event.code === 'KeyY') return () => session.redo();
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
  const mode = CURVE_EDITOR_MODE_KEYS[event.code];
  return mode ? () => session.setMode(mode) : null;
}
