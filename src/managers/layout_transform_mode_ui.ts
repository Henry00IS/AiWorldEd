import { TransformMode } from '../types/transform_mode.js';
import { StatusBar } from '../ui/status_bar.js';
import { ToolsPalette } from '../ui/tools_palette.js';

/**
 * Updates tools-palette transform highlights and status bar mode text.
 * @param toolsPalette Floating tools palette that owns transform mode buttons.
 * @param statusBar Optional status bar for mode display.
 * @param mode Active transform mode.
 */
export function applyTransformModeUi(
  toolsPalette: ToolsPalette | null | undefined,
  statusBar: StatusBar | null,
  mode: TransformMode
): void {
  toolsPalette?.setActiveTransformMode(mode);
  updateStatusBarTransformMode(statusBar, mode);
}

/**
 * Writes the transform mode name into the status bar.
 * @param statusBar Status bar instance, or null when unavailable.
 * @param mode The active transform mode.
 */
function updateStatusBarTransformMode(
  statusBar: StatusBar | null,
  mode: TransformMode
): void {
  if (!statusBar) return;
  if (mode === TransformMode.TRANSLATE) {
    statusBar.setTransformMode('Move');
    return;
  }
  if (mode === TransformMode.ROTATE) {
    statusBar.setTransformMode('Rotate');
    return;
  }
  if (mode === TransformMode.SCALE) {
    statusBar.setTransformMode('Scale');
    return;
  }
  statusBar.setTransformMode('Bounds');
}
