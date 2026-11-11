import type * as THREE from 'three';
import { outlinerRowIndexFromClientYResolve } from './outliner_drop_placement.js';
import { OutlinerEdgeAutoScroll } from './outliner_edge_auto_scroll.js';
import type { TreePaintSelectCallback } from './outliner_tree_types.js';

/** Host surface a paint selection needs from the outliner tree. */
export interface OutlinerTreePaintSelectionHost {
  /**
   * Returns the scrollable tree host element.
   *
   * @returns Tree DOM element.
   */
  getTreeElement(): HTMLElement;

  /**
   * Returns the ordered logical objects in the virtual list.
   *
   * @returns Logical row objects.
   */
  getLogicalObjects(): readonly THREE.Object3D[];

  /**
   * Returns the virtual scroll offset in CSS pixels.
   *
   * @returns Scroll offset.
   */
  getScrollOffsetPx(): number;

  /**
   * Scrolls the virtual list by a pixel delta.
   *
   * @param deltaY Delta in CSS pixels (positive scrolls down).
   * @returns True when the scroll offset changed.
   */
  scrollByDeltaPx(deltaY: number): boolean;

  /**
   * Returns the paint selection callback, if registered.
   *
   * @returns Callback or null.
   */
  getOnPaintSelect(): TreePaintSelectCallback | null;
}

/**
 * Shift-drag paint selection: pressing Shift on a row and dragging over other
 * rows selects every row from the pressed one to the one under the pointer. The
 * tree scrolls when the pointer nears or passes its top or bottom edge.
 */
export class OutlinerTreePaintSelection {
  private readonly host: OutlinerTreePaintSelectionHost;
  private readonly edgeScroll: OutlinerEdgeAutoScroll;
  private readonly mouseMoveHandleBound: (event: MouseEvent) => void;
  private readonly mouseUpHandleBound: () => void;
  private anchor: THREE.Object3D | null;
  private paintedFirst: THREE.Object3D | null;
  private paintedLast: THREE.Object3D | null;
  private pointerClientX: number;
  private pointerClientY: number;

  /**
   * Creates an idle paint selection.
   *
   * @param host Tree host providing rows and scrolling.
   */
  constructor(host: OutlinerTreePaintSelectionHost) {
    this.host = host;
    this.anchor = null;
    this.paintedFirst = null;
    this.paintedLast = null;
    this.pointerClientX = 0;
    this.pointerClientY = 0;
    this.mouseMoveHandleBound = (event) => this.mouseMoveHandle(event);
    this.mouseUpHandleBound = () => this.end();
    this.edgeScroll = new OutlinerEdgeAutoScroll({
      getTreeElement: () => this.host.getTreeElement(),
      scrollByDeltaPx: (deltaY) => this.host.scrollByDeltaPx(deltaY),
      pointerGet: () => ({ clientX: this.pointerClientX, clientY: this.pointerClientY }),
      scrollWanted: () => this.anchor !== null,
      onFrameScrolled: () => this.paintedRangeUpdate(),
    });
  }

  /**
   * Returns whether a paint gesture is running.
   *
   * @returns True between the Shift press and the release.
   */
  isActive(): boolean {
    return this.anchor !== null;
  }

  /**
   * Starts painting from a pressed row. Nothing is selected until the pointer
   * reaches another row, so a plain Shift click keeps its own behaviour.
   *
   * @param anchor Row object under the press.
   * @param event Native mouse event of the press.
   */
  begin(anchor: THREE.Object3D, event: MouseEvent): void {
    this.end();
    this.anchor = anchor;
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    document.addEventListener('mousemove', this.mouseMoveHandleBound, true);
    document.addEventListener('mouseup', this.mouseUpHandleBound, true);
  }

  /** Ends the gesture and stops scrolling. */
  end(): void {
    this.anchor = null;
    this.paintedFirst = null;
    this.paintedLast = null;
    this.edgeScroll.stop();
    document.removeEventListener('mousemove', this.mouseMoveHandleBound, true);
    document.removeEventListener('mouseup', this.mouseUpHandleBound, true);
  }

  /**
   * Follows the pointer: updates the painted rows and scrolls near the edges.
   *
   * @param event Native mouse move event.
   */
  private mouseMoveHandle(event: MouseEvent): void {
    if ((event.buttons & 1) === 0) {
      this.end();
      return;
    }
    event.preventDefault();
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    this.paintedRangeUpdate();
    this.edgeScroll.tick();
    this.edgeScroll.loopStart();
  }

  /** Reports the rows between the anchor and the row under the pointer. */
  private paintedRangeUpdate(): void {
    const anchor = this.anchor;
    const callback = this.host.getOnPaintSelect();
    if (!anchor || !callback) return;
    const rows = this.host.getLogicalObjects();
    const anchorIndex = rows.indexOf(anchor);
    const pointerIndex = this.pointerRowIndexResolve(rows.length);
    if (anchorIndex < 0 || pointerIndex === null) return;
    if (this.paintedFirst === null && pointerIndex === anchorIndex) return;
    const painted = rows.slice(Math.min(anchorIndex, pointerIndex), Math.max(anchorIndex, pointerIndex) + 1);
    if (painted[0] === this.paintedFirst && painted.at(-1) === this.paintedLast) return;
    const isFirstStep = this.paintedFirst === null;
    this.paintedFirst = painted[0] ?? null;
    this.paintedLast = painted.at(-1) ?? null;
    callback(painted, isFirstStep);
  }

  /**
   * Maps the pointer to a row index, clamped to the first and last rows.
   *
   * @param rowCount Number of logical rows.
   * @returns Row index, or null when the tree is empty.
   */
  private pointerRowIndexResolve(rowCount: number): number | null {
    const treeTop = this.host.getTreeElement().getBoundingClientRect().top;
    return outlinerRowIndexFromClientYResolve(this.pointerClientY, treeTop, this.host.getScrollOffsetPx(), rowCount);
  }
}
