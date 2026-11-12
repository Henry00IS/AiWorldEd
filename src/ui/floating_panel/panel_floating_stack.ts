import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';
import { doesElementContainEventTarget } from '@/utils/dom_node_realm.js';

/** Stacking band for floating tool windows versus modal/confirm dialogs. */
export type FloatingPanelStackLayer = 'tool' | 'modal' | 'confirm';

/** Z-index range for one stacking layer. */
interface FloatingPanelStackLayerBand {
  base: number;
  ceiling: number;
}

const LAYER_BANDS: Readonly<Record<FloatingPanelStackLayer, FloatingPanelStackLayerBand>> = {
  tool: {
    base: UiStackLayers.floatingPanelBase,
    ceiling: UiStackLayers.floatingPanelCeiling,
  },
  modal: {
    base: UiStackLayers.modal,
    ceiling: UiStackLayers.modal + 99,
  },
  confirm: {
    base: UiStackLayers.confirm,
    ceiling: UiStackLayers.confirm + 99,
  },
};

/**
 * Window manager for floating editor panels and open menu surfaces. Maintains
 * last-focused order per layer so tool windows stay below menus while
 * modals/confirm stay above. Also tracks menu roots as pointer-block surfaces
 * so viewport tools do not steal clicks under open dropdowns.
 */
export class FloatingPanelStack {
  private static readonly registeredPanels: HTMLElement[] = [];
  private static readonly clampHandlers = new Map<HTMLElement, () => void>();
  private static readonly panelLayers = new Map<HTMLElement, FloatingPanelStackLayer>();
  /**
   * Open menu roots (and similar chrome) that block viewport pointer routing
   * without participating in tool-panel z-index reassignment.
   */
  private static readonly pointerBlockSurfaces: HTMLElement[] = [];
  private static windowResizeBound = false;

  /**
   * Registers a floating panel for stacking and optional resize clamping.
   *
   * @param panel Panel root or modal backdrop element.
   * @param onWindowResize Optional callback when the browser window resizes.
   * @param layer Stacking band for this panel.
   */
  static register(panel: HTMLElement, onWindowResize?: () => void, layer: FloatingPanelStackLayer = 'tool'): void {
    if (this.registeredPanels.includes(panel)) {
      this.panelLayers.set(panel, layer);
      return;
    }
    this.registeredPanels.push(panel);
    this.panelLayers.set(panel, layer);
    if (onWindowResize) {
      this.clampHandlers.set(panel, onWindowResize);
    }
    this.ensureWindowResizeListener();
    this.reassignZIndices();
  }

  /**
   * Unregisters a panel when it is disposed.
   *
   * @param panel Panel root or modal backdrop element.
   */
  static unregister(panel: HTMLElement): void {
    const index = this.registeredPanels.indexOf(panel);
    if (index >= 0) {
      this.registeredPanels.splice(index, 1);
    }
    this.clampHandlers.delete(panel);
    this.panelLayers.delete(panel);
    this.reassignZIndices();
  }

  /**
   * Registers an open chrome surface (toolbar menu, context menu) so viewport
   * coordinate hits under it do not start tool presses.
   *
   * @param surface Menu root or other overlay element.
   */
  static registerPointerBlockSurface(surface: HTMLElement): void {
    if (this.pointerBlockSurfaces.includes(surface)) {
      return;
    }
    this.pointerBlockSurfaces.push(surface);
  }

  /**
   * Unregisters a chrome surface when the menu closes or is disposed.
   *
   * @param surface Menu root or other overlay element.
   */
  static unregisterPointerBlockSurface(surface: HTMLElement): void {
    const index = this.pointerBlockSurfaces.indexOf(surface);
    if (index < 0) {
      return;
    }
    this.pointerBlockSurfaces.splice(index, 1);
  }

  /**
   * Moves a panel to the top of its layer stacking order.
   *
   * @param panel Root element of the floating panel or modal backdrop.
   * @param layer Layer used when the panel is not yet registered.
   */
  static bringToFront(panel: HTMLElement, layer: FloatingPanelStackLayer = 'tool'): void {
    const index = this.registeredPanels.indexOf(panel);
    if (index >= 0) {
      this.registeredPanels.splice(index, 1);
    }
    this.registeredPanels.push(panel);
    if (!this.panelLayers.has(panel)) {
      this.panelLayers.set(panel, layer);
    }
    this.reassignZIndices();
  }

  /**
   * Returns the screen rects of the other open tool panels.
   *
   * @param except Panel to leave out (the one being placed).
   * @returns Rects.
   */
  static openToolRects(except: HTMLElement): DOMRect[] {
    return this.registeredPanels
      .filter((panel) => panel !== except && panel.isConnected && panel.style.display !== 'none')
      .filter((panel) => this.resolveLayer(panel) === 'tool')
      .map((panel) => panel.getBoundingClientRect());
  }

  /** Clears registrations (tests only). */
  static resetForTests(): void {
    this.registeredPanels.length = 0;
    this.clampHandlers.clear();
    this.panelLayers.clear();
    this.pointerBlockSurfaces.length = 0;
  }

  /**
   * Returns how many panels are currently registered (tests).
   *
   * @returns Registered panel count.
   */
  static getRegisteredCount(): number {
    return this.registeredPanels.length;
  }

  /**
   * Returns how many pointer-block chrome surfaces are registered (tests).
   *
   * @returns Registered pointer-block surface count.
   */
  static getPointerBlockSurfaceCount(): number {
    return this.pointerBlockSurfaces.length;
  }

  /**
   * Returns the current top z-index among tool-layer panels (tests).
   *
   * @returns Last assigned tool floating z-index, or tool base when empty.
   */
  static getCurrentTopZIndex(): number {
    const toolPanels = this.registeredPanels.filter((panel) => this.resolveLayer(panel) === 'tool');
    if (toolPanels.length === 0) {
      return UiStackLayers.floatingPanelBase;
    }
    return UiStackLayers.floatingPanelBase + toolPanels.length - 1;
  }

  /**
   * Returns whether a DOM event target lies inside any registered floating
   * window root (panel card or modal backdrop) or an open menu / chrome
   * pointer-block surface. Used so viewport tools do not treat coordinate hits
   * under open windows or menus as scene picks. Uses structural node checks so
   * detached popup chrome (separate JS realm) still blocks viewport routing.
   *
   * @param target Event target from a browser pointer event.
   * @returns True when the target is inside a registered overlay surface.
   */
  static containsEventTarget(target: EventTarget | null): boolean {
    if (this.listContainsEventTarget(this.registeredPanels, target)) {
      return true;
    }
    return this.listContainsEventTarget(this.pointerBlockSurfaces, target);
  }

  /**
   * Returns whether an event target lies inside any element of a surface list.
   *
   * @param surfaces Registered roots.
   * @param target Event target from a browser pointer event.
   * @returns True when the target is inside one of the surfaces.
   */
  private static listContainsEventTarget(surfaces: readonly HTMLElement[], target: EventTarget | null): boolean {
    for (let index = surfaces.length - 1; index >= 0; index--) {
      const surface = surfaces[index];
      if (!surface) {
        continue;
      }
      if (doesElementContainEventTarget(surface, target)) {
        return true;
      }
    }
    return false;
  }

  /** Reassigns sequential z-indices within each stacking layer. */
  private static reassignZIndices(): void {
    this.reassignLayerZIndices('tool');
    this.reassignLayerZIndices('modal');
    this.reassignLayerZIndices('confirm');
  }

  /**
   * Reassigns z-indices for one layer in registration focus order.
   *
   * @param layer Layer to reassign.
   */
  private static reassignLayerZIndices(layer: FloatingPanelStackLayer): void {
    const band = LAYER_BANDS[layer];
    const panels = this.registeredPanels.filter((panel) => this.resolveLayer(panel) === layer);
    for (let index = 0; index < panels.length; index++) {
      const panel = panels[index];
      if (!panel) {
        continue;
      }
      panel.style.zIndex = String(Math.min(band.ceiling, band.base + index));
    }
  }

  /**
   * Resolves the stack layer for a registered panel.
   *
   * @param panel Panel element.
   * @returns Stack layer.
   */
  private static resolveLayer(panel: HTMLElement): FloatingPanelStackLayer {
    return this.panelLayers.get(panel) ?? 'tool';
  }

  /** Installs a single window resize listener for all registered clamps. */
  private static ensureWindowResizeListener(): void {
    if (this.windowResizeBound || typeof window === 'undefined') {
      return;
    }
    this.windowResizeBound = true;
    window.addEventListener('resize', () => {
      this.clampHandlers.forEach((handler) => handler());
    });
  }
}
