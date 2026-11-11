import * as THREE from 'three';
import {
  OUTLINER_ROW_HEIGHT_PX,
  outlinerDragEdgeScrollBandContains,
  outlinerDragEdgeScrollDeltaResolve,
  outlinerInsertLineLeftPx,
  outlinerInsertLineNameDepthForTargetDepth,
  outlinerInsertLineViewportLocalYResolve,
  outlinerRowIndexFromClientYResolve,
  outlinerRowTopFromIndexResolve,
  resolveOutlinerDropTarget,
  type OutlinerResolvedDrop,
} from './outliner_drop_placement.js';
import { OutlinerInsertIndicator } from './outliner_insert_indicator.js';
import type { OutlinerItem } from './outliner_item.js';
import { outlinerRowElementFromNodeResolve } from './outliner_tree_drag_row_hit.js';
import type { TreeReparentCallback } from './outliner_tree_types.js';
import { hierarchyMoveSolidAllowed } from '@/outliner/hierarchy/hierarchy_move_solid_rules.js';

/** One logical outliner row for drag hit-testing (item may be off-screen). */
export interface OutlinerTreeDragRowEntry {
  /** Hierarchy object for this row. */
  object: THREE.Object3D;
  /** Bound pool row when on-screen, otherwise null. */
  item: OutlinerItem | null;
}

/** Host surface the drag session needs from the outliner tree. */
export interface OutlinerTreeDragHost {
  /**
   * Returns the hierarchy root bound to the outliner.
   *
   * @returns Tree root object.
   */
  getRoot(): THREE.Object3D;

  /**
   * Returns the scrollable tree host element.
   *
   * @returns Tree DOM element.
   */
  getTreeElement(): HTMLElement;

  /**
   * Returns the current object-to-row map for on-screen pool slots.
   *
   * @returns Bound item map.
   */
  getItemMap(): Map<THREE.Object3D, OutlinerItem>;

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
   * Returns hierarchy depth for a logical object.
   *
   * @param object Hierarchy object.
   * @returns Depth starting at 0, or negative when unknown.
   */
  getObjectDepth(object: THREE.Object3D): number;

  /**
   * Returns whether a node uuid is expanded.
   *
   * @param uuid Object uuid.
   * @returns True when expanded.
   */
  isExpanded(uuid: string): boolean;

  /**
   * Returns content children of a hierarchy node.
   *
   * @param parent Parent object.
   * @returns Content children only.
   */
  getContentChildren(parent: THREE.Object3D): THREE.Object3D[];

  /**
   * Returns the reparent drop callback, if registered.
   *
   * @returns Callback or null.
   */
  getOnReparent(): TreeReparentCallback | null;
}

/** Owns outliner row drag-and-drop session state and insert feedback. */
export class OutlinerTreeDragSession {
  private readonly host: OutlinerTreeDragHost;
  private readonly insertIndicator: OutlinerInsertIndicator;
  private readonly rowEntryByElement: WeakMap<HTMLElement, OutlinerTreeDragRowEntry>;
  private readonly documentDragOverHandleBound: (event: DragEvent) => void;
  private readonly documentDropHandleBound: (event: DragEvent) => void;
  private readonly documentWheelHandleBound: (event: WheelEvent) => void;
  private readonly edgeScrollFrameBound: () => void;
  private dragSource: THREE.Object3D | null;
  private lastResolvedDrop: OutlinerResolvedDrop<THREE.Object3D> | null;
  private lastFeedbackScrollTop: number;
  private intoHighlightItem: OutlinerItem | null;
  private dropCompleted: boolean;
  private dragVisibleRows: OutlinerTreeDragRowEntry[];
  private rowIndexByObject: Map<THREE.Object3D, number>;
  private lastPointerClientX: number;
  private lastPointerClientY: number;
  private edgeScrollFrameId: number | null;
  private edgeScrollHoldStartedAtMs: number | null;

  /**
   * Creates a drag session bound to an outliner host.
   *
   * @param host Tree host providing DOM and hierarchy accessors.
   */
  constructor(host: OutlinerTreeDragHost) {
    this.host = host;
    this.insertIndicator = new OutlinerInsertIndicator();
    this.rowEntryByElement = new WeakMap();
    this.dragSource = null;
    this.lastResolvedDrop = null;
    this.lastFeedbackScrollTop = Number.NaN;
    this.intoHighlightItem = null;
    this.dropCompleted = false;
    this.dragVisibleRows = [];
    this.rowIndexByObject = new Map();
    this.lastPointerClientX = 0;
    this.lastPointerClientY = 0;
    this.edgeScrollFrameId = null;
    this.edgeScrollHoldStartedAtMs = null;
    this.documentDragOverHandleBound = (event) => this.documentDragOverHandle(event);
    this.documentDropHandleBound = (event) => this.documentDropHandle(event);
    this.documentWheelHandleBound = (event) => this.documentWheelHandle(event);
    this.edgeScrollFrameBound = () => this.edgeScrollFrameHandle();
  }

  /**
   * Returns the insert indicator element for tests.
   *
   * @returns Indicator element.
   */
  insertIndicatorElementGet(): HTMLElement {
    return this.insertIndicator.getElement();
  }

  /**
   * Attaches the insert indicator to the tree host.
   *
   * @param treeElement Tree host element.
   */
  insertIndicatorAttach(treeElement: HTMLElement): void {
    this.insertIndicator.attachTo(treeElement);
  }

  /**
   * Binds drag-start, hover, drop, and drag-end callbacks for one row.
   *
   * @param item Outliner item.
   */
  itemDragDropCallbacksBind(item: OutlinerItem): void {
    const object = item.getObject();
    this.rowEntryByElement.set(item.getElement(), { object, item });
    item.onDragStartRequest((source) => {
      this.dragSessionBegin(source);
    });
    item.onDragHoverRequest((target, event) => {
      this.itemDragHoverHandle(target, event);
    });
    item.onDropRequest((target, event) => {
      this.itemDropHandle(target, event);
    });
    item.onDragEndRequest(() => {
      this.dragSessionEnd();
    });
  }

  /**
   * Accepts drag-over across the tree host so gaps never show the forbidden
   * cursor.
   *
   * @param treeElement Tree host element.
   */
  treeHostDropTargetBind(treeElement: HTMLElement): void {
    treeElement.addEventListener('dragover', (event) => this.treeHostDragOverHandle(event));
    treeElement.addEventListener('dragleave', (event) => this.treeHostDragLeaveHandle(event));
    treeElement.addEventListener('drop', (event) => this.treeHostDropHandle(event));
  }

  /**
   * Starts a row drag session and accepts document-level drag, drop, and wheel.
   *
   * @param source Object being dragged.
   */
  dragSessionBegin(source: THREE.Object3D): void {
    this.dragSource = source;
    this.lastResolvedDrop = null;
    this.lastFeedbackScrollTop = Number.NaN;
    this.dropCompleted = false;
    this.rowEntryMapRebuild();
    document.addEventListener('dragover', this.documentDragOverHandleBound, true);
    document.addEventListener('dragenter', this.documentDragOverHandleBound, true);
    document.addEventListener('drop', this.documentDropHandleBound, true);
    document.addEventListener('wheel', this.documentWheelHandleBound, {
      capture: true,
      passive: false,
    });
  }

  /** Ends a row drag session and hides the insert marker. */
  dragSessionEnd(): void {
    const source = this.dragSource;
    this.dragSource = null;
    this.lastResolvedDrop = null;
    this.lastFeedbackScrollTop = Number.NaN;
    this.edgeScrollLoopStop();
    this.edgeScrollHoldReset();
    this.intoHighlightClear();
    this.insertIndicator.hide();
    document.removeEventListener('dragover', this.documentDragOverHandleBound, true);
    document.removeEventListener('dragenter', this.documentDragOverHandleBound, true);
    document.removeEventListener('drop', this.documentDropHandleBound, true);
    document.removeEventListener('wheel', this.documentWheelHandleBound, true);
    this.dragSourceVisualClear(source);
  }

  /** Rebuilds O(1) row arrays/maps from the logical list and bound pool map. */
  private rowEntryMapRebuild(): void {
    this.dragVisibleRows = [];
    this.rowIndexByObject.clear();
    const itemMap = this.host.getItemMap();
    const logicalObjects = this.host.getLogicalObjects();
    for (let rowIndex = 0; rowIndex < logicalObjects.length; rowIndex += 1) {
      const object = logicalObjects[rowIndex];
      if (!object) {
        continue;
      }
      const item = itemMap.get(object) ?? null;
      const entry: OutlinerTreeDragRowEntry = { object, item };
      this.dragVisibleRows.push(entry);
      this.rowIndexByObject.set(object, rowIndex);
      if (item) {
        this.rowEntryByElement.set(item.getElement(), entry);
      }
    }
  }

  /**
   * While a row is dragged, accept drop, edge-scroll, and refresh feedback.
   *
   * @param event Document dragover / dragenter event.
   */
  private documentDragOverHandle(event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.lastPointerClientX = event.clientX;
    this.lastPointerClientY = event.clientY;
    if (!this.treePointerOverIs(event.clientX, event.clientY)) {
      this.edgeScrollLoopStop();
      return;
    }
    this.edgeScrollTickApply();
    this.edgeScrollLoopStart();
    this.pointerDropFeedbackRefresh(event.clientX, event.clientY, event.target);
  }

  /**
   * Completes a drop on the outliner from the document capture phase.
   *
   * @param event Document drop event.
   */
  private documentDropHandle(event: DragEvent): void {
    if (!this.dragSource || this.dropCompleted) {
      return;
    }
    if (!this.treePointerOverIs(event.clientX, event.clientY)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const hit = this.rowEntryFromDragEventResolve(event);
    if (!hit) {
      this.dragSessionEnd();
      return;
    }
    this.itemDropHandle(hit.object, event);
  }

  /**
   * Scrolls the outliner under the pointer while a drag is active.
   *
   * @param event Document wheel event.
   */
  private documentWheelHandle(event: WheelEvent): void {
    if (!this.dragSource) {
      return;
    }
    if (!this.treePointerOverIs(event.clientX, event.clientY)) {
      return;
    }
    event.preventDefault();
    this.lastPointerClientX = event.clientX;
    this.lastPointerClientY = event.clientY;
    if (this.treeScrollByDeltaApply(event.deltaY)) {
      this.pointerDropFeedbackRefresh(event.clientX, event.clientY, event.target);
    }
  }

  /**
   * Starts a continuous edge-scroll loop. Native HTML5 edge scroll is slow and
   * stalls when the pointer is held still; rAF keeps multi-row travel going.
   */
  private edgeScrollLoopStart(): void {
    if (this.edgeScrollFrameId !== null) {
      return;
    }
    this.edgeScrollFrameId = requestAnimationFrame(this.edgeScrollFrameBound);
  }

  /** Cancels the continuous edge-scroll loop. */
  private edgeScrollLoopStop(): void {
    if (this.edgeScrollFrameId === null) {
      return;
    }
    cancelAnimationFrame(this.edgeScrollFrameId);
    this.edgeScrollFrameId = null;
  }

  /** Clears hold-time ramp state for edge auto-scroll. */
  private edgeScrollHoldReset(): void {
    this.edgeScrollHoldStartedAtMs = null;
  }

  /** One animation frame of edge auto-scroll while the pointer stays in a band. */
  private edgeScrollFrameHandle(): void {
    this.edgeScrollFrameId = null;
    if (!this.dragSource) {
      this.edgeScrollHoldReset();
      return;
    }
    if (!this.treePointerOverIs(this.lastPointerClientX, this.lastPointerClientY)) {
      this.edgeScrollHoldReset();
      return;
    }
    const treeRect = this.host.getTreeElement().getBoundingClientRect();
    if (!outlinerDragEdgeScrollBandContains(this.lastPointerClientY, treeRect.top, treeRect.bottom)) {
      this.edgeScrollHoldReset();
      return;
    }
    const scrolled = this.edgeScrollTickApply();
    if (scrolled) {
      this.pointerDropFeedbackRefresh(this.lastPointerClientX, this.lastPointerClientY, null);
    }
    this.edgeScrollLoopStart();
  }

  /**
   * Applies one edge-scroll step from the last pointer position and hold time.
   *
   * @returns True when the virtual scroll offset changed.
   */
  private edgeScrollTickApply(): boolean {
    const treeElement = this.host.getTreeElement();
    const treeRect = treeElement.getBoundingClientRect();
    if (!outlinerDragEdgeScrollBandContains(this.lastPointerClientY, treeRect.top, treeRect.bottom)) {
      this.edgeScrollHoldReset();
      return false;
    }
    if (this.edgeScrollHoldStartedAtMs === null) {
      this.edgeScrollHoldStartedAtMs = performance.now();
    }
    const holdDurationMs = performance.now() - this.edgeScrollHoldStartedAtMs;
    const deltaY = outlinerDragEdgeScrollDeltaResolve(
      this.lastPointerClientY,
      treeRect.top,
      treeRect.bottom,
      holdDurationMs,
    );
    if (deltaY === 0) {
      return false;
    }
    return this.treeScrollByDeltaApply(deltaY);
  }

  /**
   * Returns whether the pointer is over the tree host bounds.
   *
   * @param clientX Pointer X in viewport coordinates.
   * @param clientY Pointer Y in viewport coordinates.
   * @returns True when the point lies inside the tree host rectangle.
   */
  private treePointerOverIs(clientX: number, clientY: number): boolean {
    const treeRect = this.host.getTreeElement().getBoundingClientRect();
    if (clientX < treeRect.left || clientX > treeRect.right) {
      return false;
    }
    if (clientY < treeRect.top || clientY > treeRect.bottom) {
      return false;
    }
    return true;
  }

  /**
   * Applies a scroll delta to the virtual list and rebuilds drag row maps.
   *
   * @param deltaY Scroll delta in CSS pixels.
   * @returns True when the scroll offset changed.
   */
  private treeScrollByDeltaApply(deltaY: number): boolean {
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return false;
    }
    const changed = this.host.scrollByDeltaPx(deltaY);
    if (changed) {
      this.rowEntryMapRebuild();
    }
    return changed;
  }

  /**
   * Re-resolves drop feedback at a viewport point after scroll or host hover.
   *
   * @param clientX Pointer X in viewport coordinates.
   * @param clientY Pointer Y in viewport coordinates.
   * @param eventTarget Optional event.target for HTML5 drag hit testing.
   */
  private pointerDropFeedbackRefresh(clientX: number, clientY: number, eventTarget: EventTarget | null = null): void {
    const hit = this.rowEntryFromPointerAndTargetResolve(clientX, clientY, eventTarget);
    if (!hit) {
      this.dropFeedbackVisualClear();
      return;
    }
    this.itemDragHoverFromCoordsHandle(hit.object, clientX, clientY);
  }

  /**
   * Updates the insert line while dragging over a row.
   *
   * @param target Row object under the pointer.
   * @param event Native drag event with client coordinates.
   */
  itemDragHoverHandle(target: THREE.Object3D, event: DragEvent): void {
    this.lastPointerClientX = event.clientX;
    this.lastPointerClientY = event.clientY;
    this.itemDragHoverFromCoordsHandle(target, event.clientX, event.clientY);
  }

  /**
   * Updates drop feedback from explicit pointer coordinates.
   *
   * @param target Row object under the pointer.
   * @param clientX Pointer X in viewport coordinates.
   * @param clientY Pointer Y in viewport coordinates.
   */
  private itemDragHoverFromCoordsHandle(target: THREE.Object3D, clientX: number, clientY: number): void {
    if (!this.dragSource) {
      return;
    }
    const resolved = this.dropFromPointerResolve(target, clientX, clientY);
    if (!resolved || this.dragSource === resolved.target) {
      this.dropFeedbackVisualClear();
      return;
    }
    this.dropFeedbackApply(resolved);
  }

  /**
   * Completes a drag-and-drop reparent when a valid drop target is hit.
   *
   * @param target The object that received the drop.
   * @param event Native drop event.
   */
  itemDropHandle(target: THREE.Object3D, event: DragEvent): void {
    if (this.dropCompleted) {
      return;
    }
    const source = this.dragSource;
    const resolved = this.dropFromPointerResolve(target, event.clientX, event.clientY) ?? this.lastResolvedDrop;
    this.dropCompleted = true;
    this.dragSessionEnd();
    const onReparent = this.host.getOnReparent();
    if (!source || !onReparent || !resolved) {
      return;
    }
    if (source === resolved.target) {
      return;
    }
    onReparent(source, resolved.target, resolved.placement);
  }

  /**
   * Resolves elevated drop target from pointer position using fixed row
   * geometry.
   *
   * @param hovered Row object under the pointer.
   * @param clientX Pointer X in viewport coordinates.
   * @param clientY Pointer Y in viewport coordinates.
   * @returns Resolved drop, or null when the row is unknown.
   */
  private dropFromPointerResolve(
    hovered: THREE.Object3D,
    clientX: number,
    clientY: number,
  ): OutlinerResolvedDrop<THREE.Object3D> | null {
    const depth = this.host.getObjectDepth(hovered);
    if (depth < 0) {
      return null;
    }
    const treeElement = this.host.getTreeElement();
    const treeRect = treeElement.getBoundingClientRect();
    const item = this.host.getItemMap().get(hovered) ?? null;
    const rowTop = this.rowTopForObjectResolve(hovered, item, treeRect.top);
    const rowHeight = this.rowHeightForItemResolve(item);
    return resolveOutlinerDropTarget(
      hovered,
      depth,
      clientX,
      clientY,
      rowTop,
      rowHeight,
      treeRect.left,
      hovered instanceof THREE.Group,
      (node) => this.dropElevationParentGet(node),
      (node) => this.lastContentChildOfParentIs(node),
      (node) => this.expandedDropContainerIs(node),
      (node) => this.firstContentChildGet(node),
      (node) => this.dropAfterAllowedIs(node),
    );
  }

  /**
   * Returns whether the dragged object may land right after a node, that is
   * inside the node's parent.
   *
   * @param node Hierarchy node the drop would follow.
   * @returns True when the node's parent accepts the dragged object.
   */
  private dropAfterAllowedIs(node: THREE.Object3D): boolean {
    const source = this.dragSource;
    const parent = node.parent;
    if (!source || !parent) return false;
    return hierarchyMoveSolidAllowed(source, parent);
  }

  /**
   * Resolves the viewport top of a logical row from a live element or index.
   *
   * @param object Hierarchy object for the row.
   * @param item Bound pool item, or null when off-screen.
   * @param treeTop Tree host top edge in viewport coordinates.
   * @returns Row top in viewport coordinates.
   */
  private rowTopForObjectResolve(object: THREE.Object3D, item: OutlinerItem | null, treeTop: number): number {
    if (item) {
      const rowRect = item.getElement().getBoundingClientRect();
      if (rowRect.height > 0) {
        return rowRect.top;
      }
    }
    const rowIndex = this.rowIndexByObject.get(object);
    if (rowIndex === undefined) {
      return treeTop;
    }
    return outlinerRowTopFromIndexResolve(rowIndex, treeTop, this.host.getScrollOffsetPx());
  }

  /**
   * Resolves row height from a live item or the fixed outliner constant.
   *
   * @param item Bound pool item, or null.
   * @returns Row height in CSS pixels.
   */
  private rowHeightForItemResolve(item: OutlinerItem | null): number {
    if (!item) {
      return OUTLINER_ROW_HEIGHT_PX;
    }
    const height = item.getElement().getBoundingClientRect().height;
    return height > 0 ? height : OUTLINER_ROW_HEIGHT_PX;
  }

  /**
   * Returns whether a row is an expanded container with content children.
   *
   * @param node Hierarchy node.
   * @returns True when after-on-this-row should insert as first child instead.
   */
  private expandedDropContainerIs(node: THREE.Object3D): boolean {
    if (!(node instanceof THREE.Group)) {
      return false;
    }
    if (!this.host.isExpanded(node.uuid)) {
      return false;
    }
    return this.host.getContentChildren(node).length > 0;
  }

  /**
   * Returns the first content child of a node for expanded-parent after remap.
   *
   * @param node Hierarchy node.
   * @returns First content child, or null when none.
   */
  private firstContentChildGet(node: THREE.Object3D): THREE.Object3D | null {
    const children = this.host.getContentChildren(node);
    return children[0] ?? null;
  }

  /**
   * Returns the parent used for indent elevation (stops at the tree root).
   *
   * @param node Hierarchy node.
   * @returns Parent object, or null at the outliner root.
   */
  private dropElevationParentGet(node: THREE.Object3D): THREE.Object3D | null {
    const parent = node.parent;
    if (!parent || parent === this.host.getRoot()) {
      return null;
    }
    return parent;
  }

  /**
   * Returns whether a node is the last non-helper child of its parent.
   *
   * @param node Hierarchy node.
   * @returns True when no later content sibling exists.
   */
  private lastContentChildOfParentIs(node: THREE.Object3D): boolean {
    const parent = node.parent;
    if (!parent) {
      return true;
    }
    const contentChildren = this.host.getContentChildren(parent);
    return contentChildren[contentChildren.length - 1] === node;
  }

  /**
   * Applies insert-line or into-highlight feedback for the resolved drop.
   *
   * @param resolved Elevated drop target and placement.
   */
  private dropFeedbackApply(resolved: OutlinerResolvedDrop<THREE.Object3D>): void {
    const scrollTop = this.host.getScrollOffsetPx();
    if (this.dropFeedbackSkipIs(resolved, scrollTop)) {
      return;
    }
    this.lastResolvedDrop = resolved;
    this.lastFeedbackScrollTop = scrollTop;
    if (resolved.placement === 'into') {
      this.intoDropFeedbackApply(resolved);
      return;
    }
    this.insertLineDropFeedbackApply(resolved);
  }

  /**
   * Returns whether feedback already matches the pointer resolution.
   *
   * @param resolved Newly resolved drop.
   * @param scrollTop Current tree scrollTop.
   * @returns True when DOM feedback does not need updating.
   */
  private dropFeedbackSkipIs(resolved: OutlinerResolvedDrop<THREE.Object3D>, scrollTop: number): boolean {
    const previous = this.lastResolvedDrop;
    if (!previous || previous.target !== resolved.target) {
      return false;
    }
    if (previous.placement !== resolved.placement) {
      return false;
    }
    if (previous.visualTarget !== resolved.visualTarget) {
      return false;
    }
    if (previous.insertDepth !== resolved.insertDepth) {
      return false;
    }
    return scrollTop === this.lastFeedbackScrollTop;
  }

  /**
   * Shows nest-into highlight on the resolved target row only.
   *
   * @param resolved Elevated drop target with into placement.
   */
  private intoDropFeedbackApply(resolved: OutlinerResolvedDrop<THREE.Object3D>): void {
    this.insertIndicator.hide();
    const itemMap = this.host.getItemMap();
    const visualItem = itemMap.get(resolved.visualTarget);
    const targetItem = itemMap.get(resolved.target) ?? visualItem;
    if (!targetItem) {
      this.intoHighlightClear();
      return;
    }
    this.intoHighlightItemSet(targetItem);
  }

  /**
   * Shows the insert line for before/after placement using fixed row geometry.
   *
   * @param resolved Elevated drop target with edge placement.
   */
  private insertLineDropFeedbackApply(resolved: OutlinerResolvedDrop<THREE.Object3D>): void {
    this.intoHighlightClear();
    if (resolved.placement === 'into') {
      this.insertIndicator.hide();
      return;
    }
    const visualIndex = this.rowIndexByObject.get(resolved.visualTarget);
    if (visualIndex === undefined) {
      this.insertIndicator.hide();
      return;
    }
    const hostLocalY = outlinerInsertLineViewportLocalYResolve(
      visualIndex,
      resolved.placement,
      this.host.getScrollOffsetPx(),
    );
    const nameColumnLeftPx = this.insertLineLeftPxResolve(resolved);
    this.insertIndicator.showAtHostLocalY(
      this.host.getTreeElement(),
      hostLocalY,
      resolved.insertDepth,
      nameColumnLeftPx,
    );
  }

  /**
   * Chooses insert-line left inset for before/after placement. Sibling inserts
   * align to the parent container's name column (e.g. "Group"), not the nested
   * child row text. Root-level siblings use a full-width line.
   *
   * @param resolved Elevated drop with edge placement.
   * @returns Host-local left in CSS pixels, or null for full-width root lines.
   */
  private insertLineLeftPxResolve(resolved: OutlinerResolvedDrop<THREE.Object3D>): number | null {
    const nameDepth = outlinerInsertLineNameDepthForTargetDepth(resolved.insertDepth);
    if (nameDepth < 0) {
      return null;
    }
    return outlinerInsertLineLeftPx(nameDepth);
  }

  /** Hides insert visuals without forgetting the last resolved drop target. */
  private dropFeedbackVisualClear(): void {
    this.intoHighlightClear();
    this.insertIndicator.hide();
  }

  /**
   * Sets the single into-highlight row, clearing any previous one.
   *
   * @param item Row to highlight as into target.
   */
  private intoHighlightItemSet(item: OutlinerItem): void {
    if (this.intoHighlightItem === item) {
      item.setIntoDropHighlight(true);
      return;
    }
    this.intoHighlightClear();
    this.intoHighlightItem = item;
    item.setIntoDropHighlight(true);
  }

  /** Clears the into-outline from the currently highlighted row only. */
  private intoHighlightClear(): void {
    if (!this.intoHighlightItem) {
      return;
    }
    this.intoHighlightItem.setIntoDropHighlight(false);
    this.intoHighlightItem = null;
  }

  /**
   * Restores drag-source opacity for the dragged row only.
   *
   * @param source Object that was dragged, if any.
   */
  private dragSourceVisualClear(source: THREE.Object3D | null): void {
    if (!source) {
      return;
    }
    this.host.getItemMap().get(source)?.setDragSourceVisual(false);
  }

  /**
   * Updates the insert indicator while dragging over empty tree chrome.
   *
   * @param event Drag-over event on the tree host.
   */
  private treeHostDragOverHandle(event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.lastPointerClientX = event.clientX;
    this.lastPointerClientY = event.clientY;
    this.edgeScrollTickApply();
    this.edgeScrollLoopStart();
    this.pointerDropFeedbackRefresh(event.clientX, event.clientY, event.target);
  }

  /**
   * Hides feedback visuals when the pointer leaves the tree host entirely.
   *
   * @param event Drag-leave event on the tree host.
   */
  private treeHostDragLeaveHandle(event: DragEvent): void {
    if (this.treePointerOverIs(event.clientX, event.clientY)) {
      return;
    }
    const related = event.relatedTarget;
    if (related instanceof Node && this.host.getTreeElement().contains(related)) {
      return;
    }
    this.edgeScrollLoopStop();
    this.dropFeedbackVisualClear();
  }

  /**
   * Completes a drop on the tree host (including inter-row gaps).
   *
   * @param event Drop event on the tree host.
   */
  private treeHostDropHandle(event: DragEvent): void {
    if (!this.dragSource || this.dropCompleted) {
      return;
    }
    event.preventDefault();
    const hit = this.rowEntryFromDragEventResolve(event);
    if (!hit) {
      this.dragSessionEnd();
      return;
    }
    this.itemDropHandle(hit.object, event);
  }

  /**
   * Finds the row under a drag event using target then fixed-height index.
   *
   * @param event Drag or drop event with client coordinates.
   * @returns Hit entry, or null when no row can be resolved.
   */
  private rowEntryFromDragEventResolve(event: DragEvent): OutlinerTreeDragRowEntry | null {
    return this.rowEntryFromPointerAndTargetResolve(event.clientX, event.clientY, event.target);
  }

  /**
   * Finds the row under the pointer in O(1) via event target or row index.
   *
   * @param clientX Pointer X in viewport coordinates.
   * @param clientY Pointer Y in viewport coordinates.
   * @param eventTarget Optional event.target from the drag event.
   * @returns Hit object and item, or null when the tree is empty.
   */
  private rowEntryFromPointerAndTargetResolve(
    _clientX: number,
    clientY: number,
    eventTarget: EventTarget | null,
  ): OutlinerTreeDragRowEntry | null {
    const fromTarget = this.rowEntryFromEventTargetResolve(eventTarget);
    if (fromTarget) {
      return fromTarget;
    }
    return this.rowEntryFromClientYIndexResolve(clientY);
  }

  /**
   * Resolves a row entry from a drag event target node.
   *
   * @param eventTarget Event target under the pointer.
   * @returns Hit entry, or null when the target is not inside a row.
   */
  private rowEntryFromEventTargetResolve(eventTarget: EventTarget | null): OutlinerTreeDragRowEntry | null {
    if (!(eventTarget instanceof Node)) {
      return null;
    }
    const rowElement = outlinerRowElementFromNodeResolve(eventTarget);
    if (!rowElement) {
      return null;
    }
    return this.rowEntryByElement.get(rowElement) ?? null;
  }

  /**
   * O(1) row lookup from fixed-height Y indexing into the drag snapshot array.
   *
   * @param clientY Pointer Y in viewport coordinates.
   * @returns Hit entry, or null when the tree is empty.
   */
  private rowEntryFromClientYIndexResolve(clientY: number): OutlinerTreeDragRowEntry | null {
    const rowCount = this.dragVisibleRows.length;
    if (rowCount === 0) {
      return null;
    }
    const treeElement = this.host.getTreeElement();
    const treeTop = treeElement.getBoundingClientRect().top;
    const index = outlinerRowIndexFromClientYResolve(clientY, treeTop, this.host.getScrollOffsetPx(), rowCount);
    if (index === null) {
      return null;
    }
    return this.dragVisibleRows[index] ?? null;
  }
}
