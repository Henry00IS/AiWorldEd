import type * as THREE from 'three';
import { outlinerRowIndexFromClientYResolve } from './outliner_drop_placement.js';
import { RowPaintDrag } from '@/ui/drag/row_paint_drag.js';
import type { TreePaintSelectCallback } from './outliner_tree_types.js';
import { isCtrlOrMetaPressedOnDomFlags } from '@/input/modifier_keys_query.js';

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
 * Modifier-drag paint selection: pressing Shift or Ctrl/Meta on a row and
 * dragging over other rows selects or deselects every row from the pressed one
 * to the one under the pointer. The tree scrolls when the pointer nears or
 * passes its top or bottom edge.
 */
export class OutlinerTreePaintSelection {
  private readonly host: OutlinerTreePaintSelectionHost;
  private readonly drag: RowPaintDrag;
  private anchor: THREE.Object3D | null;
  private subtractive: boolean;

  /**
   * Creates an idle paint selection.
   *
   * @param host Tree host providing rows and scrolling.
   */
  constructor(host: OutlinerTreePaintSelectionHost) {
    this.host = host;
    this.anchor = null;
    this.subtractive = false;
    this.drag = new RowPaintDrag({
      element: () => this.host.getTreeElement(),
      scrollBy: (deltaY) => this.host.scrollByDeltaPx(deltaY),
      rowAt: (clientY) => this.pointerRowIndexResolve(clientY),
      anchorRow: () => {
        const index = this.anchor ? this.host.getLogicalObjects().indexOf(this.anchor) : -1;
        return index < 0 ? null : index;
      },
      paint: (first, last, _pointerRow, firstStep) =>
        this.host.getOnPaintSelect()?.(
          this.host.getLogicalObjects().slice(first, last + 1),
          firstStep,
          this.subtractive,
        ),
    });
  }

  /**
   * Returns whether a paint drag is in progress.
   *
   * @returns True while painting.
   */
  isActive(): boolean {
    return this.anchor !== null;
  }

  /**
   * Starts a paint drag from an anchor row.
   *
   * @param anchor Row object the gesture started on.
   * @param event Mouse down event (reads modifiers and pointer).
   */
  begin(anchor: THREE.Object3D, event: MouseEvent): void {
    this.end();
    this.anchor = anchor;
    this.subtractive = isCtrlOrMetaPressedOnDomFlags(event);
    this.drag.begin(event);
  }

  /** Ends the paint drag. */
  end(): void {
    this.anchor = null;
    this.subtractive = false;
    this.drag.end();
  }

  /**
   * Resolves the row under a pointer height.
   *
   * @param clientY Pointer height in client pixels.
   * @returns Row index, or null when the tree has no rows.
   */
  private pointerRowIndexResolve(clientY: number): number | null {
    const treeTop = this.host.getTreeElement().getBoundingClientRect().top;
    const rowCount = this.host.getLogicalObjects().length;
    return outlinerRowIndexFromClientYResolve(clientY, treeTop, this.host.getScrollOffsetPx(), rowCount);
  }
}
