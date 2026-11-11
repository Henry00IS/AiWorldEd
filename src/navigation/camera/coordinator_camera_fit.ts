import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ControllerCameraFit } from '@/navigation/camera/controller_camera_fit.js';
import { CameraAnimationConfig } from '@/navigation/camera/camera_animation_config.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';

/** Coordinates fit-to-selection camera framing for one or all viewports. */
export class CoordinatorCameraFit {
  private cameraFitController: ControllerCameraFit;
  private cameraAnimationConfig: CameraAnimationConfig;
  private selectionManager: ManagerSelection;
  private statusBar: StatusBar | null;
  private getOrderedViewports: () => Array<ViewportEditor>;
  private getActiveViewportIndex: () => number;
  private getDetachedViewports: () => readonly ViewportEditor[];

  /**
   * Creates a camera fit coordinator.
   *
   * @param selectionManager Selection source for framing targets.
   * @param statusBar Status bar for fit feedback, or null.
   * @param getOrderedViewports Returns main-window viewports in activation
   *   order.
   * @param getActiveViewportIndex Returns the active main-window viewport
   *   index.
   * @param getDetachedViewports Returns live detached multi-monitor viewports.
   */
  constructor(
    selectionManager: ManagerSelection,
    statusBar: StatusBar | null,
    getOrderedViewports: () => Array<ViewportEditor>,
    getActiveViewportIndex: () => number,
    getDetachedViewports: () => readonly ViewportEditor[] = () => [],
  ) {
    this.cameraFitController = new ControllerCameraFit();
    this.cameraAnimationConfig = this.cameraFitController.getConfig();
    this.selectionManager = selectionManager;
    this.statusBar = statusBar;
    this.getOrderedViewports = getOrderedViewports;
    this.getActiveViewportIndex = getActiveViewportIndex;
    this.getDetachedViewports = getDetachedViewports;
  }

  /**
   * Binds fit-to-selection keyboard shortcuts.
   *
   * @param keyboardShortcutHandler Keyboard handler to register on.
   */
  bindKeyboardShortcuts(keyboardShortcutHandler: HandlerKeyboardShortcut): void {
    keyboardShortcutHandler.setOnFitToSelection((event) => this.onFitToSelection(event));
    keyboardShortcutHandler.setOnFitAllViewports(() => this.onFitAllViewports());
  }

  /** Advances all active camera fit animations by one frame. */
  updateAnimations(): void {
    this.cameraFitController.updateAnimations();
  }

  /**
   * Fits the viewport that owns the shortcut key. Detached popups fit their own
   * pane; main-window keys use the hovered/active main pane.
   *
   * @param event Optional key event used to identify the source window.
   */
  onFitToSelection(event?: KeyboardEvent): void {
    const viewport = this.resolveFitTargetViewport(event);
    if (!viewport) {
      return;
    }
    this.fitSpecificViewport(viewport);
  }

  /**
   * Fits a single viewport camera to the current selection.
   *
   * @param viewport The viewport whose camera should be fitted.
   */
  fitSpecificViewport(viewport: ViewportEditor): void {
    audioViewportFocus.record(viewport);
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    const count = this.cameraFitController.fitViewportToSelection(viewport, selected, this.cameraAnimationConfig);
    SelectionClickThrough.resetClickThrough();
    this.showFitFeedback(count);
  }

  /** Fits all main-window viewports to the current selection. */
  onFitAllViewports(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    const count = this.cameraFitController.fitAllViewportsToSelection(
      this.getOrderedViewports(),
      selected,
      this.cameraAnimationConfig,
    );
    SelectionClickThrough.resetClickThrough();
    this.showFitFeedback(count);
  }

  /**
   * Chooses the viewport that should receive fit for a keyboard shortcut.
   *
   * @param event Optional key event from the focused window.
   * @returns Target viewport, or undefined when none is available.
   */
  private resolveFitTargetViewport(event?: KeyboardEvent): ViewportEditor | undefined {
    const detachedViewport = this.resolveDetachedViewportFromEvent(event);
    if (detachedViewport) {
      return detachedViewport;
    }
    return this.getOrderedViewports()[this.getActiveViewportIndex()];
  }

  /**
   * Finds the detached viewport hosted by the window that received the key.
   *
   * @param event Optional key event.
   * @returns Matching detached viewport, or null for main-window keys.
   */
  private resolveDetachedViewportFromEvent(event?: KeyboardEvent): ViewportEditor | null {
    const eventWindow = this.readEventWindow(event);
    if (!eventWindow || eventWindow === window) {
      return null;
    }
    for (const viewport of this.getDetachedViewports()) {
      if (this.viewportBelongsToWindow(viewport, eventWindow)) {
        return viewport;
      }
    }
    return null;
  }

  /**
   * Reads the window that dispatched a keyboard event.
   *
   * @param event Optional key event.
   * @returns Event view window, or null when unavailable.
   */
  private readEventWindow(event?: KeyboardEvent): Window | null {
    if (!event) {
      return null;
    }
    if (event.view) {
      return event.view;
    }
    const target = event.target;
    if (target instanceof Node) {
      return target.ownerDocument?.defaultView ?? null;
    }
    return null;
  }

  /**
   * Returns true when a viewport's DOM lives in the given window.
   *
   * @param viewport Editor viewport to test.
   * @param targetWindow Window that received the shortcut.
   * @returns True when the viewport is hosted by that window.
   */
  private viewportBelongsToWindow(viewport: ViewportEditor, targetWindow: Window): boolean {
    const ownerDocument = viewport.getContainer().ownerDocument;
    if (!ownerDocument) {
      return false;
    }
    if (ownerDocument.defaultView === targetWindow) {
      return true;
    }
    return ownerDocument === targetWindow.document;
  }

  /**
   * Displays the fit feedback message in the status bar.
   *
   * @param count The number of objects that were framed.
   */
  private showFitFeedback(count: number): void {
    if (!this.statusBar) return;
    this.statusBar.setFitFeedback(`Framed ${count} object(s)`);
    setTimeout(() => {
      this.statusBar?.setFitFeedback('');
    }, 3000);
  }
}
