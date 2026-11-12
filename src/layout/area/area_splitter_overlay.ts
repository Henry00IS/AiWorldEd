import { WindowPointerDragSession } from '@/utils/session_window_pointer_drag.js';
import { listSharedBorders, type AreaSharedBorder } from './area_adjacency.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import type { ControllerAreaLayout } from './controller_area_layout.js';
import { computeSplitRatioFromNormalizedPointer } from './area_layout_tree.js';

/** Hit target thickness for resize splitters in CSS pixels. */
const SPLITTER_HIT_PX = 6;

/**
 * Renders draggable border hit targets between adjacent areas and updates split
 * ratios on the layout controller.
 */
export class AreaSplitterOverlay {
  private readonly layer: HTMLElement;
  private readonly controller: ControllerAreaLayout;
  private readonly host: HTMLElement;
  private readonly dragSession: WindowPointerDragSession;
  private readonly elements: HTMLElement[];
  private onResized: (() => void) | null;

  /**
   * Creates a splitter overlay inside the pane layer.
   *
   * @param paneLayer Absolute pane layer.
   * @param controller Area layout controller.
   */
  constructor(paneLayer: HTMLElement, controller: ControllerAreaLayout) {
    this.layer = paneLayer;
    this.controller = controller;
    this.host = this.createHost();
    this.layer.appendChild(this.host);
    this.dragSession = new WindowPointerDragSession();
    this.elements = [];
    this.onResized = null;
  }

  /**
   * Sets a callback invoked after a resize drag updates geometry.
   *
   * @param handler Resize completion callback.
   */
  setOnResized(handler: (() => void) | null): void {
    this.onResized = handler;
  }

  /**
   * Rebuilds splitter hit targets from the current placements.
   *
   * @param placements Live leaf placements.
   */
  rebuild(placements: readonly AreaLeafPlacement[]): void {
    this.clearElements();
    const borders = listSharedBorders(placements);
    for (const border of borders) {
      this.elements.push(this.createSplitterElement(border));
    }
  }

  /** Removes overlay host and listeners. */
  dispose(): void {
    this.dragSession.end();
    this.clearElements();
    this.host.remove();
  }

  /**
   * Creates the absolute host for splitter elements.
   *
   * @returns Host element.
   */
  private createHost(): HTMLElement {
    const host = this.layer.ownerDocument.createElement('div');
    host.classList.add('editor-area-splitter-host');
    host.style.position = 'absolute';
    host.style.inset = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '5';
    return host;
  }

  /**
   * Creates one draggable splitter for a shared border.
   *
   * @param border Shared border description.
   * @returns Splitter element.
   */
  private createSplitterElement(border: AreaSharedBorder): HTMLElement {
    const element = this.layer.ownerDocument.createElement('div');
    element.classList.add('editor-area-splitter');
    element.style.position = 'absolute';
    element.style.pointerEvents = 'auto';
    element.style.zIndex = '6';
    element.style.background = 'transparent';
    this.applyBorderGeometry(element, border);
    element.style.cursor = border.direction === 'horizontal' ? 'col-resize' : 'row-resize';
    element.addEventListener('pointerdown', (event) => this.onSplitterPointerDown(event, border));
    this.host.appendChild(element);
    return element;
  }

  /**
   * Positions a splitter element over the border segment.
   *
   * @param element Splitter element.
   * @param border Border geometry.
   */
  private applyBorderGeometry(element: HTMLElement, border: AreaSharedBorder): void {
    const rect = border.borderRect;
    const half = SPLITTER_HIT_PX / 2;
    if (border.direction === 'horizontal') {
      element.style.left = `calc(${rect.x * 100}% + ${rect.width * 50}% - ${half}px)`;
      element.style.top = `${rect.y * 100}%`;
      element.style.width = `${SPLITTER_HIT_PX}px`;
      element.style.height = `${rect.height * 100}%`;
      return;
    }
    element.style.left = `${rect.x * 100}%`;
    element.style.top = `calc(${rect.y * 100}% + ${rect.height * 50}% - ${half}px)`;
    element.style.width = `${rect.width * 100}%`;
    element.style.height = `${SPLITTER_HIT_PX}px`;
  }

  /**
   * Starts a ratio drag for a border.
   *
   * @param event Pointer down event.
   * @param border Border being dragged.
   */
  private onSplitterPointerDown(event: PointerEvent, border: AreaSharedBorder): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const layerRect = this.layer.getBoundingClientRect();
    const startRatio = this.readCurrentRatio(border);
    this.dragSession.begin(
      (moveEvent) => this.onSplitterDrag(moveEvent, border, layerRect, startRatio),
      () => this.onResized?.(),
      this.layer.ownerDocument.defaultView ?? window,
    );
  }

  /**
   * Updates split ratio while dragging a border.
   *
   * @param event Pointer move.
   * @param border Border being resized.
   * @param layerRect Layer client rect at drag start.
   * @param _startRatio Ratio at drag start (unused; absolute pointer mapping).
   */
  private onSplitterDrag(event: PointerEvent, border: AreaSharedBorder, layerRect: DOMRect, _startRatio: number): void {
    void _startRatio;
    if (layerRect.width <= 0 || layerRect.height <= 0) return;
    const ratio = this.computeRatioFromPointer(event, border, layerRect);
    this.controller.setSplitRatioBetween(border.firstAreaId, border.secondAreaId, ratio);
  }

  /**
   * Computes the two-pane ratio from the pointer along the shared border span.
   *
   * @param event Pointer event.
   * @param border Border.
   * @param layerRect Layer bounds.
   * @returns Ratio in [0,1] for
   *   {@link AreaLayoutController.setSplitRatioBetween}.
   */
  private computeRatioFromPointer(event: PointerEvent, border: AreaSharedBorder, layerRect: DOMRect): number {
    const normalizedX = (event.clientX - layerRect.left) / layerRect.width;
    const normalizedY = (event.clientY - layerRect.top) / layerRect.height;
    return computeSplitRatioFromNormalizedPointer(
      this.controller.getRoot(),
      border.firstAreaId,
      border.secondAreaId,
      border.direction,
      normalizedX,
      normalizedY,
    );
  }

  /**
   * Reads the current two-pane ratio for the border pair.
   *
   * @param border Border pair.
   * @returns Fraction of the shared span owned by the first area.
   */
  private readCurrentRatio(border: AreaSharedBorder): number {
    const placements = this.controller.getPlacements();
    const first = placements.find((item) => item.payload.areaId === border.firstAreaId);
    const second = placements.find((item) => item.payload.areaId === border.secondAreaId);
    if (!first || !second) return 0.5;
    if (border.direction === 'horizontal') {
      const total = first.rect.width + second.rect.width;
      return total > 0 ? first.rect.width / total : 0.5;
    }
    const total = first.rect.height + second.rect.height;
    return total > 0 ? first.rect.height / total : 0.5;
  }

  /** Removes all splitter elements. */
  private clearElements(): void {
    for (const element of this.elements) {
      element.remove();
    }
    this.elements.length = 0;
  }
}
