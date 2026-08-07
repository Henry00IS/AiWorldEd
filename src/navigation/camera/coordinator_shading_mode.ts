import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { HandlerShadingMode } from './handler_shading_mode.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import { bindViewportToolbarShadingControls } from '@/ui/viewport_chrome/viewport_toolbar_shading_bind.js';

/** Coordinates per-viewport shading modes, toolbars, and keyboard shortcuts. */
export class CoordinatorShadingMode {
  private getViewports: () => readonly ViewportEditor[];
  private getViewportElements: () => readonly HTMLElement[];
  private selectionVisualController: ControllerSelectionVisual;
  private statusBar: StatusBar | null;
  private shadingControllers: ControllerViewportShading[];
  private shadingModeHandler: HandlerShadingMode;
  private activeViewportIndex: number;
  private activationUnsubscribers: Array<() => void>;
  private onFitViewport: ((viewport: ViewportEditor) => void) | null;

  /**
   * Creates shading mode coordination state. Call wireControls to bind UI.
   *
   * @param getViewports Returns live viewports in pane order.
   * @param getViewportElements Returns DOM containers in the same order.
   * @param selectionVisualController Selection visuals that need shading refs.
   * @param statusBar Status bar for shading mode display, or null.
   */
  constructor(
    getViewports: () => readonly ViewportEditor[],
    getViewportElements: () => readonly HTMLElement[],
    selectionVisualController: ControllerSelectionVisual,
    statusBar: StatusBar | null,
  ) {
    this.getViewports = getViewports;
    this.getViewportElements = getViewportElements;
    this.selectionVisualController = selectionVisualController;
    this.statusBar = statusBar;
    this.activeViewportIndex = 0;
    this.activationUnsubscribers = [];
    this.onFitViewport = null;
    this.shadingControllers = this.collectShadingControllers();
    this.selectionVisualController.setShadingControllers(this.shadingControllers);
    this.shadingModeHandler = new HandlerShadingMode(this.shadingControllers, this.activeViewportIndex, this.statusBar);
  }

  /**
   * Binds shading keyboard shortcuts, activation tracking, and viewport
   * toolbars.
   *
   * @param keyboardShortcutHandler Keyboard handler for shading keys.
   * @param onFitViewport Callback when a viewport Fit button is pressed.
   */
  wireControls(
    keyboardShortcutHandler: HandlerKeyboardShortcut,
    onFitViewport: (viewport: ViewportEditor) => void,
  ): void {
    this.onFitViewport = onFitViewport;
    keyboardShortcutHandler.setOnShadingMode((mode) => this.onShadingMode(mode));
    this.rebindViewportUi();
    this.updateShadingMeshes();
    this.syncStatusBarShadingMode();
  }

  /**
   * Rebinds activation listeners and toolbars after the live viewport set
   * changes.
   */
  rebindViewportUi(): void {
    this.clearActivationListeners();
    this.shadingControllers = this.collectShadingControllers();
    this.selectionVisualController.setShadingControllers(this.shadingControllers);
    this.shadingModeHandler = new HandlerShadingMode(
      this.shadingControllers,
      Math.min(this.activeViewportIndex, Math.max(0, this.shadingControllers.length - 1)),
      this.statusBar,
    );
    this.bindViewportActivation();
    if (this.onFitViewport) {
      this.bindViewportToolbars(this.onFitViewport);
    }
  }

  /**
   * Returns the active viewport index within the ordered viewport list.
   *
   * @returns Active viewport index.
   */
  getActiveViewportIndex(): number {
    return this.activeViewportIndex;
  }

  /**
   * Returns viewports in pane order from the live provider.
   *
   * @returns The ordered viewport array.
   */
  getOrderedViewports(): ViewportEditor[] {
    return [...this.getViewports()];
  }

  /** Updates the wireframe overlay meshes for all viewports. */
  updateShadingMeshes(): void {
    this.getViewports().forEach((viewport) => {
      viewport.updateShadingMeshes(viewport.collectSelectableObjects());
    });
  }

  /**
   * Collects shading controllers from all viewports.
   *
   * @returns An array of ViewportShadingController instances.
   */
  private collectShadingControllers(): ControllerViewportShading[] {
    return this.getViewports().map((viewport) => viewport.getShadingController());
  }

  /**
   * Binds pointer enter/move/down so the active viewport follows the pane under
   * the cursor (same target model as wheel zoom), not only the last click.
   */
  private bindViewportActivation(): void {
    this.getViewportElements().forEach((element, index) => {
      const activate = () => this.activateViewportAtIndex(index);
      element.addEventListener('pointerdown', activate);
      element.addEventListener('pointerenter', activate);
      element.addEventListener('pointermove', activate);
      this.activationUnsubscribers.push(() => {
        element.removeEventListener('pointerdown', activate);
        element.removeEventListener('pointerenter', activate);
        element.removeEventListener('pointermove', activate);
      });
    });
  }

  /**
   * Marks a viewport as active when the pointer is over it.
   *
   * @param index Viewport index in pane order.
   */
  private activateViewportAtIndex(index: number): void {
    if (this.activeViewportIndex === index) {
      return;
    }
    this.activeViewportIndex = index;
    this.shadingModeHandler.setActiveViewportIndex(index);
    this.syncStatusBarShadingMode();
  }

  /** Removes previously registered activation listeners. */
  private clearActivationListeners(): void {
    this.activationUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.activationUnsubscribers = [];
  }

  /**
   * Wires shading and Fit actions on each viewport overlay toolbar.
   *
   * @param onFitViewport Callback when Fit is pressed for a viewport.
   */
  private bindViewportToolbars(onFitViewport: (viewport: ViewportEditor) => void): void {
    const viewports = this.getOrderedViewports();
    viewports.forEach((viewport, index) => {
      bindViewportToolbarShadingControls(viewport, {
        onBeforeApply: () => this.activateViewportAtIndex(index),
        onAfterShadingMode: () => this.syncStatusBarShadingMode(),
      });
      viewport.getViewportToolbar().setOnFit(() => onFitViewport(viewport));
    });
  }

  /** Writes the active viewport's shading mode into the status bar. */
  private syncStatusBarShadingMode(): void {
    if (!this.statusBar) return;
    const mode = this.shadingModeHandler.getActiveMode();
    const displayName = mode.replace(/\s+/g, '_').toUpperCase();
    this.statusBar.setShadingMode(displayName);
  }

  /**
   * Handles shading mode changes from keyboard shortcuts for the active
   * viewport.
   *
   * @param mode The shading mode to apply.
   */
  private onShadingMode(mode: ShadingMode): void {
    const viewport = this.getOrderedViewports()[this.activeViewportIndex];
    if (!viewport) return;
    viewport.setShadingMode(mode);
    this.syncStatusBarShadingMode();
  }
}
