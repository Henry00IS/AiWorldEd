import { Theme } from '@/theme.js';
import { WindowPointerDragSession } from '@/utils/session_window_pointer_drag.js';
import type { ControllerAreaLayout } from './controller_area_layout.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import { listJoinableNeighbors } from './policy_area_join.js';
import type { AreaSplitDirection } from './area_split_direction.js';
import { clampAreaSplitRatio } from './area_layout_tree.js';
import type { ViewportKind } from '@/viewports/core/viewport_kind.js';
import { computeAreaCornerGripStyle, type AreaCornerName } from './area_corner_grip_geometry.js';

export type { AreaCornerName } from './area_corner_grip_geometry.js';

/** Corner grip size in CSS pixels. */
const CORNER_HIT_PX = 12;
/** Minimum drag distance before a split/join commits intent. */
const GESTURE_THRESHOLD_PX = 12;
/** Preview divider thickness in CSS pixels. */
const PREVIEW_LINE_PX = 2;

/** Result of a completed corner gesture. */
export type AreaCornerGestureResult =
  | { type: 'split'; areaId: string; direction: AreaSplitDirection; ratio: number }
  | { type: 'join'; survivorId: string; removeId: string }
  | { type: 'detach'; areaId: string; viewportKind: ViewportKind }
  | { type: 'none' };

/**
 * Resolves corner-drag join ids: the area whose corner was dragged expands
 * (survivor); the neighbor under the pointer is closed (remove).
 *
 * @param sourceAreaId Area that owns the dragged corner grip.
 * @param joinTargetId Neighbor the pointer is over during join preview.
 * @returns Survivor and remove area ids for
 *   {@link AreaLayoutController.joinAreas}.
 */
export function resolveCornerJoinIds(
  sourceAreaId: string,
  joinTargetId: string,
): { survivorId: string; removeId: string } {
  return {
    survivorId: sourceAreaId,
    removeId: joinTargetId,
  };
}

/** Host callbacks for corner gesture outcomes. */
export interface AreaCornerGestureHost {
  /**
   * Called when a gesture completes so the host can create/remove viewports.
   *
   * @param result Gesture result.
   */
  onGestureComplete(result: AreaCornerGestureResult): void;
}

/** Live preview state while a corner drag is active. */
interface CornerDragPreviewState {
  mode: 'split' | 'join' | 'detach' | 'idle';
  direction?: AreaSplitDirection;
  ratio?: number;
  joinTargetId?: string;
}

/**
 * Attaches corner grips to each area for corner-drag split, join, and detach.
 * Shows a live preview line/highlight while dragging.
 */
export class AreaCornerGesture {
  private readonly layer: HTMLElement;
  private readonly controller: ControllerAreaLayout;
  private readonly host: AreaCornerGestureHost;
  private readonly gripHost: HTMLElement;
  private readonly previewHost: HTMLElement;
  private readonly previewLine: HTMLElement;
  private readonly previewHighlight: HTMLElement;
  private readonly dragSession: WindowPointerDragSession;
  private readonly grips: HTMLElement[];
  private lastPointer: { x: number; y: number } | null;

  /**
   * Creates corner gesture handling for a pane layer.
   *
   * @param paneLayer Absolute pane layer.
   * @param controller Area layout controller.
   * @param host Gesture completion host.
   */
  constructor(paneLayer: HTMLElement, controller: ControllerAreaLayout, host: AreaCornerGestureHost) {
    this.layer = paneLayer;
    this.controller = controller;
    this.host = host;
    this.gripHost = this.createOverlayHost('editor-area-corner-host', '7');
    this.previewHost = this.createOverlayHost('editor-area-corner-preview-host', '8');
    this.previewLine = this.createPreviewLine();
    this.previewHighlight = this.createPreviewHighlight();
    this.previewHost.appendChild(this.previewHighlight);
    this.previewHost.appendChild(this.previewLine);
    this.layer.appendChild(this.gripHost);
    this.layer.appendChild(this.previewHost);
    this.dragSession = new WindowPointerDragSession();
    this.grips = [];
    this.lastPointer = null;
    this.hidePreview();
  }

  /**
   * Rebuilds corner grips for the current placements.
   *
   * @param placements Live leaf placements.
   */
  rebuild(placements: readonly AreaLeafPlacement[]): void {
    this.clearGrips();
    for (const placement of placements) {
      this.addCornersForPlacement(placement);
    }
  }

  /** Disposes grips and listeners. */
  dispose(): void {
    this.dragSession.end();
    this.clearGrips();
    this.gripHost.remove();
    this.previewHost.remove();
  }

  /**
   * Creates an absolute overlay host.
   *
   * @param className CSS class name.
   * @param zIndex Stacking order string.
   * @returns Host element.
   */
  private createOverlayHost(className: string, zIndex: string): HTMLElement {
    const host = document.createElement('div');
    host.classList.add(className);
    host.style.position = 'absolute';
    host.style.inset = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = zIndex;
    return host;
  }

  /**
   * Creates the split preview divider element.
   *
   * @returns Preview line element.
   */
  private createPreviewLine(): HTMLElement {
    const line = document.createElement('div');
    line.classList.add('editor-area-split-preview-line');
    line.style.position = 'absolute';
    line.style.background = `#${Theme.selectionColor.toString(16).padStart(6, '0')}`;
    line.style.pointerEvents = 'none';
    line.style.opacity = '0.9';
    line.style.display = 'none';
    return line;
  }

  /**
   * Creates the join/detach highlight overlay.
   *
   * @returns Highlight element.
   */
  private createPreviewHighlight(): HTMLElement {
    const highlight = document.createElement('div');
    highlight.classList.add('editor-area-corner-preview-highlight');
    highlight.style.position = 'absolute';
    highlight.style.pointerEvents = 'none';
    highlight.style.display = 'none';
    highlight.style.boxSizing = 'border-box';
    return highlight;
  }

  /**
   * Adds four corner grips for one placement.
   *
   * @param placement Leaf placement.
   */
  private addCornersForPlacement(placement: AreaLeafPlacement): void {
    const corners: AreaCornerName[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const corner of corners) {
      this.grips.push(this.createGrip(placement, corner));
    }
  }

  /**
   * Creates one corner grip element.
   *
   * @param placement Host placement.
   * @param corner Corner name.
   * @returns Grip element.
   */
  private createGrip(placement: AreaLeafPlacement, corner: AreaCornerName): HTMLElement {
    const grip = document.createElement('div');
    grip.classList.add('editor-area-corner-grip');
    grip.style.position = 'absolute';
    grip.style.width = `${CORNER_HIT_PX}px`;
    grip.style.height = `${CORNER_HIT_PX}px`;
    grip.style.pointerEvents = 'auto';
    grip.style.cursor = 'crosshair';
    grip.style.background = 'transparent';
    this.positionGrip(grip, placement, corner);
    grip.addEventListener('pointerdown', (event) => this.onGripPointerDown(event, placement, corner));
    this.gripHost.appendChild(grip);
    return grip;
  }

  /**
   * Positions a grip fully inside the named corner of a pane. Uses the same
   * half-gap inset as area chrome so grips never sit in the separator between
   * panes (where two neighbors would otherwise compete for the same hit).
   *
   * @param grip Grip element.
   * @param placement Leaf placement.
   * @param corner Corner name.
   */
  private positionGrip(grip: HTMLElement, placement: AreaLeafPlacement, corner: AreaCornerName): void {
    const style = computeAreaCornerGripStyle(placement.rect, corner, Theme.separatorGapPx, CORNER_HIT_PX);
    grip.style.left = style.left;
    grip.style.top = style.top;
  }

  /**
   * Begins a corner drag gesture with live preview updates.
   *
   * @param event Pointer down.
   * @param placement Source placement.
   * @param corner Source corner.
   */
  private onGripPointerDown(event: PointerEvent, placement: AreaLeafPlacement, corner: AreaCornerName): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    this.lastPointer = { x: startX, y: startY };
    const layerRect = this.layer.getBoundingClientRect();
    this.dragSession.begin(
      (moveEvent) => {
        this.lastPointer = { x: moveEvent.clientX, y: moveEvent.clientY };
        this.updateLivePreview(placement, corner, startX, startY, layerRect);
      },
      () => {
        this.hidePreview();
        this.finishGesture(placement, corner, startX, startY, layerRect);
      },
    );
  }

  /**
   * Updates the split/join/detach preview from the current pointer.
   *
   * @param placement Source placement.
   * @param corner Source corner.
   * @param startX Drag start client X.
   * @param startY Drag start client Y.
   * @param layerRect Layer bounds.
   */
  private updateLivePreview(
    placement: AreaLeafPlacement,
    corner: AreaCornerName,
    startX: number,
    startY: number,
    layerRect: DOMRect,
  ): void {
    const state = this.resolvePreviewState(placement, corner, startX, startY, layerRect);
    this.renderPreview(placement, state);
  }

  /**
   * Resolves the current preview mode without committing the gesture.
   *
   * @param placement Source placement.
   * @param corner Source corner.
   * @param startX Drag start client X.
   * @param startY Drag start client Y.
   * @param layerRect Layer bounds.
   * @returns Preview state.
   */
  private resolvePreviewState(
    placement: AreaLeafPlacement,
    corner: AreaCornerName,
    startX: number,
    startY: number,
    layerRect: DOMRect,
  ): CornerDragPreviewState {
    void corner;
    const last = this.readLastPointer(startX, startY);
    const dx = last.x - startX;
    const dy = last.y - startY;
    if (Math.hypot(dx, dy) < GESTURE_THRESHOLD_PX) {
      return { mode: 'idle' };
    }
    if (this.isOutsideLayer(last.x, last.y, layerRect)) {
      return { mode: 'detach' };
    }
    const joinTargetId = this.findJoinTarget(placement, last.x, last.y, layerRect);
    if (joinTargetId) {
      return { mode: 'join', joinTargetId };
    }
    const direction: AreaSplitDirection = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    const ratio = clampAreaSplitRatio(this.computeSplitRatio(placement, direction, last, layerRect));
    return { mode: 'split', direction, ratio };
  }

  /**
   * Renders the live preview overlay for the given state.
   *
   * @param placement Source placement.
   * @param state Preview state.
   */
  private renderPreview(placement: AreaLeafPlacement, state: CornerDragPreviewState): void {
    if (state.mode === 'idle') {
      this.hidePreview();
      return;
    }
    if (state.mode === 'split' && state.direction && state.ratio !== undefined) {
      this.showSplitPreview(placement, state.direction, state.ratio);
      return;
    }
    if (state.mode === 'join' && state.joinTargetId) {
      this.showJoinPreview(placement.payload.areaId, state.joinTargetId);
      return;
    }
    if (state.mode === 'detach') {
      this.showDetachPreview(placement);
    }
  }

  /**
   * Shows a divider line at the prospective split ratio inside the source area.
   *
   * @param placement Source placement.
   * @param direction Split axis.
   * @param ratio First-child ratio.
   */
  private showSplitPreview(placement: AreaLeafPlacement, direction: AreaSplitDirection, ratio: number): void {
    this.previewHighlight.style.display = 'none';
    this.previewLine.style.display = 'block';
    const rect = placement.rect;
    if (direction === 'horizontal') {
      const x = rect.x + rect.width * ratio;
      this.previewLine.style.left = `calc(${x * 100}% - ${PREVIEW_LINE_PX / 2}px)`;
      this.previewLine.style.top = `${rect.y * 100}%`;
      this.previewLine.style.width = `${PREVIEW_LINE_PX}px`;
      this.previewLine.style.height = `${rect.height * 100}%`;
      return;
    }
    const y = rect.y + rect.height * ratio;
    this.previewLine.style.left = `${rect.x * 100}%`;
    this.previewLine.style.top = `calc(${y * 100}% - ${PREVIEW_LINE_PX / 2}px)`;
    this.previewLine.style.width = `${rect.width * 100}%`;
    this.previewLine.style.height = `${PREVIEW_LINE_PX}px`;
  }

  /**
   * Highlights the join target (the area that will close when the source
   * expands).
   *
   * @param sourceId Source area id (gesture origin; survives the join).
   * @param targetId Join target area id (absorbed / closed).
   */
  private showJoinPreview(sourceId: string, targetId: string): void {
    void sourceId;
    this.previewLine.style.display = 'none';
    const target = this.controller.getPlacements().find((item) => item.payload.areaId === targetId);
    if (!target) {
      this.hidePreview();
      return;
    }
    this.previewHighlight.style.display = 'block';
    this.previewHighlight.style.left = `${target.rect.x * 100}%`;
    this.previewHighlight.style.top = `${target.rect.y * 100}%`;
    this.previewHighlight.style.width = `${target.rect.width * 100}%`;
    this.previewHighlight.style.height = `${target.rect.height * 100}%`;
    this.previewHighlight.style.background = 'rgba(232, 106, 23, 0.18)';
    this.previewHighlight.style.border = `1px solid #${Theme.selectionColor.toString(16).padStart(6, '0')}`;
  }

  /**
   * Highlights the source area as about to detach.
   *
   * @param placement Source placement.
   */
  private showDetachPreview(placement: AreaLeafPlacement): void {
    this.previewLine.style.display = 'none';
    this.previewHighlight.style.display = 'block';
    this.previewHighlight.style.left = `${placement.rect.x * 100}%`;
    this.previewHighlight.style.top = `${placement.rect.y * 100}%`;
    this.previewHighlight.style.width = `${placement.rect.width * 100}%`;
    this.previewHighlight.style.height = `${placement.rect.height * 100}%`;
    this.previewHighlight.style.background = 'rgba(61, 184, 201, 0.16)';
    this.previewHighlight.style.border = `1px dashed #${Theme.clipPoint2Color.toString(16).padStart(6, '0')}`;
  }

  /** Hides all preview visuals. */
  private hidePreview(): void {
    this.previewLine.style.display = 'none';
    this.previewHighlight.style.display = 'none';
  }

  /**
   * Resolves split, join, or detach from the completed drag.
   *
   * @param placement Source placement.
   * @param corner Source corner.
   * @param startX Drag start client X.
   * @param startY Drag start client Y.
   * @param layerRect Layer bounds at drag start.
   */
  private finishGesture(
    placement: AreaLeafPlacement,
    corner: AreaCornerName,
    startX: number,
    startY: number,
    layerRect: DOMRect,
  ): void {
    const state = this.resolvePreviewState(placement, corner, startX, startY, layerRect);
    if (state.mode === 'idle') {
      this.host.onGestureComplete({ type: 'none' });
      return;
    }
    if (state.mode === 'detach') {
      this.emitDetach(placement);
      return;
    }
    if (state.mode === 'join' && state.joinTargetId) {
      const joinIds = resolveCornerJoinIds(placement.payload.areaId, state.joinTargetId);
      this.host.onGestureComplete({
        type: 'join',
        survivorId: joinIds.survivorId,
        removeId: joinIds.removeId,
      });
      return;
    }
    if (state.mode === 'split' && state.direction && state.ratio !== undefined) {
      this.host.onGestureComplete({
        type: 'split',
        areaId: placement.payload.areaId,
        direction: state.direction,
        ratio: state.ratio,
      });
    }
  }

  /**
   * Emits detach for an area leaving the window.
   *
   * @param placement Source placement.
   */
  private emitDetach(placement: AreaLeafPlacement): void {
    const kind = placement.payload.viewportKind;
    if (!kind) {
      this.host.onGestureComplete({ type: 'none' });
      return;
    }
    this.host.onGestureComplete({
      type: 'detach',
      areaId: placement.payload.areaId,
      viewportKind: kind,
    });
  }

  /**
   * Computes split ratio from pointer position within the source rect.
   *
   * @param placement Source placement.
   * @param direction Split axis.
   * @param pointer Client pointer.
   * @param layerRect Layer bounds.
   * @returns Ratio for the original area as first child.
   */
  private computeSplitRatio(
    placement: AreaLeafPlacement,
    direction: AreaSplitDirection,
    pointer: { x: number; y: number },
    layerRect: DOMRect,
  ): number {
    const nx = (pointer.x - layerRect.left) / layerRect.width;
    const ny = (pointer.y - layerRect.top) / layerRect.height;
    const rect = placement.rect;
    if (direction === 'horizontal') {
      return (nx - rect.x) / rect.width;
    }
    return (ny - rect.y) / rect.height;
  }

  /**
   * Finds a joinable neighbor under the pointer, if any.
   *
   * @param placement Source placement.
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   * @param layerRect Layer bounds.
   * @returns Neighbor area id or null.
   */
  private findJoinTarget(
    placement: AreaLeafPlacement,
    clientX: number,
    clientY: number,
    layerRect: DOMRect,
  ): string | null {
    if (this.controller.getLeafCount() < 2) return null;
    const nx = (clientX - layerRect.left) / layerRect.width;
    const ny = (clientY - layerRect.top) / layerRect.height;
    const neighbors = listJoinableNeighbors(this.controller.getRoot(), placement.payload.areaId);
    for (const neighbor of neighbors) {
      if (pointInRect(nx, ny, neighbor.rect)) return neighbor.payload.areaId;
    }
    return null;
  }

  /**
   * Returns whether a client point lies outside the layer (with small margin).
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   * @param layerRect Layer bounds.
   * @returns True when outside.
   */
  private isOutsideLayer(clientX: number, clientY: number, layerRect: DOMRect): boolean {
    const margin = 4;
    return (
      clientX < layerRect.left - margin ||
      clientX > layerRect.right + margin ||
      clientY < layerRect.top - margin ||
      clientY > layerRect.bottom + margin
    );
  }

  /**
   * Reads the last known pointer from the drag, falling back to the start.
   *
   * @param startX Start X.
   * @param startY Start Y.
   * @returns Pointer coordinates.
   */
  private readLastPointer(startX: number, startY: number): { x: number; y: number } {
    return this.lastPointer ?? { x: startX, y: startY };
  }

  /** Clears grip elements. */
  private clearGrips(): void {
    for (const grip of this.grips) {
      grip.remove();
    }
    this.grips.length = 0;
  }
}

/**
 * Returns whether a normalized point lies inside a rect.
 *
 * @param x Normalized x.
 * @param y Normalized y.
 * @param rect Target rect.
 * @returns True when inside.
 */
function pointInRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
