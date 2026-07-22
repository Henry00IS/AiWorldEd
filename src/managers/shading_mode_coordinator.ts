import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { SelectionVisualController } from './selection_visual_controller.js';
import { ShadingModeHandler } from './shading_mode_handler.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { StatusBar } from '../ui/status_bar.js';
import { ShadingMode } from '../types/shading_mode.js';
import { ViewportShadingController } from '../viewports/viewport_shading_controller.js';

/**
 * Coordinates per-viewport shading modes, toolbars, and keyboard shortcuts.
 */
export class ShadingModeCoordinator {
  private viewport2DTop: Viewport2D;
  private viewport2DFront: Viewport2D;
  private viewport2DSide: Viewport2D;
  private viewport3D: Viewport3D;
  private viewportElements: HTMLElement[];
  private selectionVisualController: SelectionVisualController;
  private statusBar: StatusBar | null;
  private shadingControllers: ViewportShadingController[];
  private shadingModeHandler: ShadingModeHandler;
  private activeViewportIndex: number;

  /**
   * Creates shading mode coordination state. Call wireControls to bind UI.
   * @param viewport2DTop Top orthographic viewport.
   * @param viewport2DFront Front orthographic viewport.
   * @param viewport2DSide Side orthographic viewport.
   * @param viewport3D Perspective viewport.
   * @param viewportElements DOM containers used for activation tracking.
   * @param selectionVisualController Selection visuals that need shading refs.
   * @param statusBar Status bar for shading mode display, or null.
   */
  constructor(
    viewport2DTop: Viewport2D,
    viewport2DFront: Viewport2D,
    viewport2DSide: Viewport2D,
    viewport3D: Viewport3D,
    viewportElements: HTMLElement[],
    selectionVisualController: SelectionVisualController,
    statusBar: StatusBar | null
  ) {
    this.viewport2DTop = viewport2DTop;
    this.viewport2DFront = viewport2DFront;
    this.viewport2DSide = viewport2DSide;
    this.viewport3D = viewport3D;
    this.viewportElements = viewportElements;
    this.selectionVisualController = selectionVisualController;
    this.statusBar = statusBar;
    this.activeViewportIndex = 3;
    this.shadingControllers = this.collectShadingControllers();
    this.selectionVisualController.setShadingControllers(this.shadingControllers);
    this.shadingModeHandler = new ShadingModeHandler(
      this.shadingControllers,
      this.activeViewportIndex,
      this.statusBar
    );
  }

  /**
   * Binds shading keyboard shortcuts, activation tracking, and viewport toolbars.
   * @param keyboardShortcutHandler Keyboard handler for shading keys.
   * @param onFitViewport Callback when a viewport Fit button is pressed.
   */
  wireControls(
    keyboardShortcutHandler: KeyboardShortcutHandler,
    onFitViewport: (viewport: Viewport2D | Viewport3D) => void
  ): void {
    keyboardShortcutHandler.setOnShadingMode((mode) => this.onShadingMode(mode));
    this.bindViewportActivation();
    this.bindViewportToolbars(onFitViewport);
    this.updateShadingMeshes();
    this.syncStatusBarShadingMode();
  }

  /**
   * Returns the active viewport index (0 top, 1 front, 2 side, 3 perspective).
   * @returns Active viewport index.
   */
  getActiveViewportIndex(): number {
    return this.activeViewportIndex;
  }

  /**
   * Returns viewports in activation-index order: Top, Front, Side, Perspective.
   * @returns The ordered viewport array.
   */
  getOrderedViewports(): Array<Viewport2D | Viewport3D> {
    return [
      this.viewport2DTop,
      this.viewport2DFront,
      this.viewport2DSide,
      this.viewport3D
    ];
  }

  /**
   * Updates the wireframe overlay meshes for all viewports.
   */
  updateShadingMeshes(): void {
    this.viewport2DTop.updateShadingMeshes(
      this.viewport2DTop.collectSelectableObjects()
    );
    this.viewport2DFront.updateShadingMeshes(
      this.viewport2DFront.collectSelectableObjects()
    );
    this.viewport2DSide.updateShadingMeshes(
      this.viewport2DSide.collectSelectableObjects()
    );
    this.viewport3D.updateShadingMeshes(
      this.viewport3D.collectSelectableObjects()
    );
  }

  /**
   * Collects shading controllers from all viewports.
   * @returns An array of ViewportShadingController instances.
   */
  private collectShadingControllers(): ViewportShadingController[] {
    return [
      this.viewport2DTop.getShadingController(),
      this.viewport2DFront.getShadingController(),
      this.viewport2DSide.getShadingController(),
      this.viewport3D.getShadingController()
    ];
  }

  /**
   * Binds pointer down events to track the active viewport.
   */
  private bindViewportActivation(): void {
    this.viewportElements.forEach((el, index) => {
      el.addEventListener('pointerdown', () => {
        this.activeViewportIndex = index;
        this.shadingModeHandler.setActiveViewportIndex(index);
        this.syncStatusBarShadingMode();
      });
    });
  }

  /**
   * Wires shading and Fit actions on each viewport overlay toolbar.
   * @param onFitViewport Callback when Fit is pressed for a viewport.
   */
  private bindViewportToolbars(
    onFitViewport: (viewport: Viewport2D | Viewport3D) => void
  ): void {
    const viewports = this.getOrderedViewports();
    viewports.forEach((viewport, index) => {
      const toolbar = viewport.getViewportToolbar();
      toolbar.setActiveShadingMode(viewport.getShadingMode());
      toolbar.setOnShadingMode((mode) => {
        this.activeViewportIndex = index;
        this.shadingModeHandler.setActiveViewportIndex(index);
        viewport.setShadingMode(mode);
        this.syncStatusBarShadingMode();
      });
      toolbar.setOnFit(() => onFitViewport(viewport));
    });
  }

  /**
   * Writes the active viewport's shading mode into the status bar.
   */
  private syncStatusBarShadingMode(): void {
    if (!this.statusBar) return;
    const mode = this.shadingModeHandler.getActiveMode();
    const displayName = mode.replace(/\s+/g, '_').toUpperCase();
    this.statusBar.setShadingMode(displayName);
  }

  /**
   * Handles shading mode changes from keyboard shortcuts for the active viewport.
   * @param mode The shading mode to apply.
   */
  private onShadingMode(mode: ShadingMode): void {
    const viewport = this.getOrderedViewports()[this.activeViewportIndex];
    if (!viewport) return;
    viewport.setShadingMode(mode);
    this.syncStatusBarShadingMode();
  }
}
