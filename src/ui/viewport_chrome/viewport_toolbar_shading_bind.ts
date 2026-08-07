import type { ShadingMode } from '@/types/shading_mode.js';
import type { ViewportToolbar } from './viewport_toolbar.js';

/**
 * Viewport surface required to bind shading, content wireframes, and projected
 * grid controls on a {@link ViewportToolbar}.
 */
export interface ViewportToolbarShadingTarget {
  getViewportToolbar(): ViewportToolbar;
  getShadingMode(): ShadingMode;
  setShadingMode(mode: ShadingMode): void;
  areContentWireframesVisible(): boolean;
  setContentWireframesVisible(visible: boolean): void;
  isProjectedGridVisible(): boolean;
  setProjectedGridVisible(visible: boolean): void;
}

/** Optional hooks around toolbar shading control application. */
export interface ViewportToolbarShadingBindOptions {
  /** Called before any shading control is applied (for example pane activation). */
  onBeforeApply?: () => void;
  /**
   * Called after a shading mode change is applied.
   *
   * @param mode Applied shading mode.
   */
  onAfterShadingMode?: (mode: ShadingMode) => void;
}

/**
 * Syncs toolbar button state from the viewport's current shading preferences.
 *
 * @param viewport Viewport providing live shading preferences.
 */
export function syncViewportToolbarShadingState(viewport: ViewportToolbarShadingTarget): void {
  const toolbar = viewport.getViewportToolbar();
  toolbar.setActiveShadingMode(viewport.getShadingMode());
  toolbar.setContentWireframesActive(viewport.areContentWireframesVisible());
  toolbar.setProjectedGridActive(viewport.isProjectedGridVisible());
}

/**
 * Wires shading mode, content wireframes, and projected grid toolbar controls
 * to a viewport. Synchronizes toolbar button state from the viewport, then
 * assigns toolbar callbacks that apply those preferences on the viewport and
 * invoke optional hooks from options when present.
 *
 * @param viewport Viewport whose toolbar controls are bound.
 * @param options Optional hooks invoked around control application.
 */
export function bindViewportToolbarShadingControls(
  viewport: ViewportToolbarShadingTarget,
  options: ViewportToolbarShadingBindOptions = {},
): void {
  const toolbar = viewport.getViewportToolbar();
  syncViewportToolbarShadingState(viewport);
  toolbar.setOnShadingMode((mode) => {
    options.onBeforeApply?.();
    viewport.setShadingMode(mode);
    options.onAfterShadingMode?.(mode);
  });
  toolbar.setOnContentWireframesToggle((visible) => {
    options.onBeforeApply?.();
    viewport.setContentWireframesVisible(visible);
  });
  toolbar.setOnProjectedGridToggle((visible) => {
    options.onBeforeApply?.();
    viewport.setProjectedGridVisible(visible);
  });
}
