import { ControllerAreaLayout } from '@/layout/area/controller_area_layout.js';
import { AreaLayoutInteraction } from '@/layout/area/area_layout_interaction.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';
import type { AreaTreeNode } from '@/layout/area/area_tree_node.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type { ViewportKind } from '@/viewports/core/viewport_kind.js';

/** Callbacks a detached window supplies to the split pane layout it hosts. */
export interface DetachedViewportPanesHost {
  /**
   * Creates and wires a live viewport inside an area container.
   *
   * @param kind Viewport kind to create.
   * @param container Area host element.
   * @returns New editor viewport.
   */
  createViewport(kind: ViewportKind, container: HTMLElement): ViewportEditor;

  /**
   * Announces a viewport after the layout registered it.
   *
   * @param viewport Registered viewport.
   */
  onViewportAdded(viewport: ViewportEditor): void;

  /**
   * Tears down a viewport that left the layout.
   *
   * @param viewport Viewport being removed.
   */
  disposeViewport(viewport: ViewportEditor): void;

  /**
   * Opens a separate detached window for an area dragged out of this one.
   *
   * @param kind Viewport kind of the dragged area.
   * @returns True when the new window opened.
   */
  detachArea(kind: ViewportKind): boolean;

  /**
   * Receives the logical layout tree after any split, join, resize or kind
   * change.
   *
   * @param root Current layout tree.
   */
  onLayoutChanged(root: AreaTreeNode): void;
}

/**
 * Tiles one detached window into split viewport areas with the same splitters,
 * corner gestures and maximize behaviour as the main window.
 */
export class DetachedViewportPanes {
  private readonly layer: HTMLElement;
  private readonly host: DetachedViewportPanesHost;
  private readonly controller: ControllerAreaLayout;
  private readonly viewports: Map<string, ViewportEditor>;
  private interaction: AreaLayoutInteraction | null;
  private layerWidth: number;
  private layerHeight: number;

  /**
   * Prepares the area layout; {@link start} creates the viewports.
   *
   * @param layer Absolute layer that receives the area containers.
   * @param root Initial layout tree.
   * @param host Window callbacks.
   */
  constructor(layer: HTMLElement, root: AreaTreeNode, host: DetachedViewportPanesHost) {
    this.layer = layer;
    this.host = host;
    this.controller = new ControllerAreaLayout(layer, root);
    this.viewports = new Map();
    this.layerWidth = layer.clientWidth;
    this.layerHeight = layer.clientHeight;
    this.interaction = null;
  }

  /** Creates one viewport per area and installs splitters and corner gestures. */
  start(): void {
    if (this.interaction) return;
    this.controller.apply({ pruneMissing: true }).forEach((placement) => this.addPlacementViewport(placement));
    this.interaction = new AreaLayoutInteraction(this.layer, this.controller, {
      onAreaAdded: (areaId, container, kind) => this.addArea(areaId, container, kind),
      onAreaRemoved: (areaId) => this.removeArea(areaId),
      onDetachArea: (kind) => this.host.detachArea(kind),
      onGeometryChanged: () => this.notifyLayoutChanged(),
      onStructureChanged: () => this.notifyLayoutChanged(),
    });
  }

  /**
   * Returns every live viewport in layout order, including areas hidden while
   * another area is maximized.
   *
   * @returns Live viewports.
   */
  getViewports(): ViewportEditor[] {
    return this.collectViewports(this.controller.getRoot());
  }

  /**
   * Returns the viewports currently shown in the window.
   *
   * @returns Displayed viewports in layout order.
   */
  getVisibleViewports(): ViewportEditor[] {
    return this.controller.getPlacements().flatMap((placement) => {
      const viewport = this.viewports.get(placement.payload.areaId);
      return viewport ? [viewport] : [];
    });
  }

  /**
   * Returns the logical layout tree, ignoring a temporary maximize.
   *
   * @returns Layout tree.
   */
  getRoot(): AreaTreeNode {
    return this.controller.getRoot();
  }

  /**
   * Fills the window with one area, or restores the split layout when that area
   * is already maximized. A window with a single area has nothing to maximize.
   *
   * @param areaId Area to toggle.
   */
  toggleMaximize(areaId: string): void {
    if (!this.controller.isMaximized() && this.controller.getLeafCount() < 2) return;
    this.controller.toggleMaximized(areaId);
    this.refreshMaximizeButtons();
  }

  /**
   * Replaces the viewport of one area with another kind.
   *
   * @param areaId Area to change.
   * @param kind New viewport kind.
   */
  changeKind(areaId: string, kind: ViewportKind): void {
    const container = this.controller.getLayoutDom().getContainer(areaId);
    const previous = this.viewports.get(areaId);
    if (!container || !previous || previous.getViewportKind() === kind) return;
    this.removeArea(areaId);
    container.replaceChildren();
    this.controller.setViewportKind(areaId, kind);
    this.addArea(areaId, container, kind);
    this.notifyLayoutChanged();
  }

  /** Re-snaps area boxes to whole pixels when the window size changed. */
  syncLayerSize(): void {
    const width = this.layer.clientWidth;
    const height = this.layer.clientHeight;
    if (width === this.layerWidth && height === this.layerHeight) return;
    this.layerWidth = width;
    this.layerHeight = height;
    this.controller.snapGeometryToPixels();
  }

  /** Removes the overlays and disposes every viewport. */
  dispose(): void {
    this.interaction?.dispose();
    this.interaction = null;
    [...this.viewports.keys()].forEach((areaId) => this.removeArea(areaId));
    this.controller.getLayoutDom().clear();
  }

  /**
   * Creates the viewport for an applied placement.
   *
   * @param placement Leaf placement with its container.
   */
  private addPlacementViewport(placement: ReturnType<ControllerAreaLayout['getPlacements']>[number]): void {
    const container = this.controller.getLayoutDom().getContainer(placement.payload.areaId);
    const kind = placement.payload.viewportKind;
    if (!container || kind === undefined) return;
    this.addArea(placement.payload.areaId, container, kind);
  }

  /**
   * Creates, registers and wires the viewport of one area.
   *
   * @param areaId Area id.
   * @param container Area host element.
   * @param kind Viewport kind.
   */
  private addArea(areaId: string, container: HTMLElement, kind: ViewportKind): void {
    if (this.viewports.has(areaId)) return;
    const viewport = this.host.createViewport(kind, container);
    this.viewports.set(areaId, viewport);
    const toolbar = viewport.getViewportToolbar();
    toolbar.setOnToggleMaximize(() => this.toggleMaximize(areaId));
    toolbar.setOnViewportKindChange((nextKind) => this.changeKind(areaId, nextKind));
    toolbar.setMaximized(this.controller.getMaximizedAreaId() === areaId);
    this.host.onViewportAdded(viewport);
  }

  /**
   * Unregisters and disposes the viewport of one area.
   *
   * @param areaId Area id.
   */
  private removeArea(areaId: string): void {
    const viewport = this.viewports.get(areaId);
    if (!viewport) return;
    this.viewports.delete(areaId);
    this.host.disposeViewport(viewport);
  }

  /** Mirrors the maximize state onto every area toolbar. */
  private refreshMaximizeButtons(): void {
    const maximizedAreaId = this.controller.getMaximizedAreaId();
    this.viewports.forEach((viewport, areaId) => {
      viewport.getViewportToolbar().setMaximized(areaId === maximizedAreaId);
    });
  }

  /** Reports the logical layout to the window. */
  private notifyLayoutChanged(): void {
    this.host.onLayoutChanged(this.controller.getRoot());
  }

  /**
   * Lists the viewports of a tree in leaf order.
   *
   * @param root Layout tree.
   * @returns Live viewports.
   */
  private collectViewports(root: AreaTreeNode): ViewportEditor[] {
    return listAreaLeafPlacements(root).flatMap((placement) => {
      const viewport = this.viewports.get(placement.payload.areaId);
      return viewport ? [viewport] : [];
    });
  }
}
