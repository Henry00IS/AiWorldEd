import { ShadingMode } from '../types/shading_mode.js';
import { ViewportShadingController } from '../viewports/viewport_shading_controller.js';
import { StatusBar } from '../ui/status_bar.js';

/**
 * Maps ShadingMode values to their display names for the status bar.
 */
const SHADING_MODE_DISPLAY_NAMES: Record<ShadingMode, string> = {
  [ShadingMode.SOLID]: 'SOLID',
  [ShadingMode.WIREFRAME]: 'WIREFRAME',
  [ShadingMode.FLAT]: 'FLAT',
  [ShadingMode.WIREFRAME_OVERLAY]: 'WIREFRAME_OVERLAY'
};

/**
 * Centralized handler for viewport shading mode operations.
 * Coordinates shading mode changes across multiple viewport controllers,
 * tracks the active viewport, and provides status bar feedback.
 */
export class ShadingModeHandler {
  private controllers: ViewportShadingController[];
  private activeViewportIndex: number;
  private statusBar: StatusBar | null;

  /**
   * Creates a new shading mode handler.
   * @param controllers The per-viewport shading controllers to manage.
   * @param activeViewportIndex The index of the currently active viewport.
   * @param statusBar The status bar for feedback display, or null.
   */
  constructor(
    controllers: ViewportShadingController[],
    activeViewportIndex: number,
    statusBar: StatusBar | null
  ) {
    this.controllers = controllers;
    this.activeViewportIndex = activeViewportIndex;
    this.statusBar = statusBar;
  }

  /**
   * Updates which viewport is considered active for shading changes.
   * @param index The new active viewport index.
   */
  setActiveViewportIndex(index: number): void {
    this.activeViewportIndex = index;
  }

  /**
   * Applies a shading mode to the currently active viewport.
   * Updates the status bar to reflect the change.
   * @param mode The shading mode to apply.
   */
  applyShadingMode(mode: ShadingMode): void {
    if (this.activeViewportIndex < 0 || this.activeViewportIndex >= this.controllers.length) {
      return;
    }
    const controller = this.controllers[this.activeViewportIndex];
    controller.setShadingMode(mode);
    this.updateStatusBar(mode);
  }

  /**
   * Applies a shading mode to all managed viewports simultaneously.
   * @param mode The shading mode to apply to every viewport.
   */
  applyShadingModeToAll(mode: ShadingMode): void {
    this.controllers.forEach((controller) => {
      controller.setShadingMode(mode);
    });
    this.updateStatusBar(mode);
  }

  /**
   * Updates the status bar with the current shading mode name.
   * @param mode The shading mode to display.
   */
  private updateStatusBar(mode: ShadingMode): void {
    if (!this.statusBar) return;
    const displayName = SHADING_MODE_DISPLAY_NAMES[mode];
    this.statusBar.setShadingMode(displayName);
  }

  /**
   * Returns the shading mode of the currently active viewport.
   * @returns The active viewport's ShadingMode value.
   */
  getActiveMode(): ShadingMode {
    if (this.activeViewportIndex < 0 || this.activeViewportIndex >= this.controllers.length) {
      return ShadingMode.SOLID;
    }
    return this.controllers[this.activeViewportIndex].getShadingMode();
  }
}
