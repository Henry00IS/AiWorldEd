import { TransformMode } from '../types/transform_mode.js';
import { Toolbar } from '../ui/toolbar.js';
import { StatusBar } from '../ui/status_bar.js';

/**
 * Updates toolbar transform-mode button active states and status bar text.
 * @param toolbar Editor toolbar that owns Move/Rotate/Scale/Bounds buttons.
 * @param statusBar Optional status bar for mode display.
 * @param mode Active transform mode.
 */
export function applyTransformModeUi(
  toolbar: Toolbar,
  statusBar: StatusBar | null,
  mode: TransformMode
): void {
  clearTransformButtonActiveStates(toolbar);
  setActiveTransformButton(toolbar, mode);
  updateStatusBarTransformMode(statusBar, mode);
}

/**
 * Clears active styling from all transform mode toolbar buttons.
 * @param toolbar Editor toolbar instance.
 */
function clearTransformButtonActiveStates(toolbar: Toolbar): void {
  toolbar.setButtonActiveByLabel('Move', false);
  toolbar.setButtonActiveByLabel('Rotate', false);
  toolbar.setButtonActiveByLabel('Scale', false);
  toolbar.setButtonActiveByLabel('Bounds', false);
}

/**
 * Marks the toolbar button matching the current transform mode as active.
 * @param toolbar Editor toolbar instance.
 * @param mode The active transform mode.
 */
function setActiveTransformButton(toolbar: Toolbar, mode: TransformMode): void {
  if (mode === TransformMode.TRANSLATE) {
    toolbar.setButtonActiveByLabel('Move', true);
    return;
  }
  if (mode === TransformMode.ROTATE) {
    toolbar.setButtonActiveByLabel('Rotate', true);
    return;
  }
  if (mode === TransformMode.SCALE) {
    toolbar.setButtonActiveByLabel('Scale', true);
    return;
  }
  toolbar.setButtonActiveByLabel('Bounds', true);
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
