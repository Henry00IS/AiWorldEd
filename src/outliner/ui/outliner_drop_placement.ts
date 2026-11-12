/**
 * Vertical drop placement relative to an outliner row. Matches the workspace
 * tab strip's edge-insert idea, but for a vertical tree: before / after a row,
 * or into a container that can receive children.
 */
export type OutlinerDropPlacement = 'before' | 'after' | 'into';

/** Tree host padding (matches {@link OutlinerTree} container padding). */
export const OUTLINER_TREE_PADDING_PX = 4;

/** Fixed outliner row height (matches {@link OutlinerItem} row styling). */
export const OUTLINER_ROW_HEIGHT_PX = 22;

/**
 * Pointer distance from the tree top/bottom edge that triggers drag
 * auto-scroll. Chrome does not deliver wheel events during HTML5 drag, so edge
 * scrolling is the reliable scroll path. Wide band keeps early motion subtle
 * before a high-power ease ramps only near the rim.
 */
export const OUTLINER_DRAG_SCROLL_EDGE_PX = 96;

/**
 * Minimum rows scrolled per animation frame at the inner edge of the band
 * (near-zero creep when first entering the edge zone).
 */
export const OUTLINER_DRAG_SCROLL_MIN_ROWS = 0.02;

/**
 * Maximum rows scrolled per animation frame at the outer edge after a full hold
 * ramp (still fast enough for long lists, not teleport-speed).
 */
export const OUTLINER_DRAG_SCROLL_MAX_ROWS = 8;

/**
 * Ease exponent for drag edge scroll position intensity (higher keeps speed low
 * until the rim). t^6 holds the bulk of the band near creep.
 */
export const OUTLINER_DRAG_SCROLL_EASE_POWER = 6;

/**
 * Hold duration in the edge band before drag auto-scroll reaches full speed.
 * Prevents grabbing a top/bottom row from instantly flinging the list away.
 */
export const OUTLINER_DRAG_SCROLL_HOLD_RAMP_MS = 2000;

/**
 * Extra vertical room when revealing a selected row via scroll-into-view. About
 * two row heights so the focus is not glued to the viewport edge.
 */
export const OUTLINER_REVEAL_MARGIN_PX = OUTLINER_ROW_HEIGHT_PX * 2;

/** Base left padding on an outliner row (depth 0). */
export const OUTLINER_BASE_PADDING_PX = 4;

/** Extra left padding per hierarchy depth level. */
export const OUTLINER_INDENT_PX = 16;

/** Expand/collapse chevron column width on each row. */
export const OUTLINER_CHEVRON_WIDTH_PX = 16;

/**
 * Object-type icon font size (matches {@link OutlinerItem} icon styling). Used
 * as a fallback width when measuring the live name column is unavailable.
 */
export const OUTLINER_ICON_FONT_PX = 12;

/** Icon trailing margin before the name label. */
export const OUTLINER_ICON_MARGIN_RIGHT_PX = 4;

/**
 * Icon slot after the chevron (font size plus margin). Used when estimating the
 * name-column start for nested insert lines.
 */
export const OUTLINER_ICON_SLOT_PX = OUTLINER_ICON_FONT_PX + OUTLINER_ICON_MARGIN_RIGHT_PX;

/**
 * Chevron plus icon lead-in after a row's depth padding. Nested insert lines
 * start after this chrome so they align with the name column. Depth hit-testing
 * does not treat this chrome as a shallow zone — only the true left gutter
 * (shallower than the row's own indent) elevates the drop.
 */
export const OUTLINER_LEADING_CHROME_PX = OUTLINER_CHEVRON_WIDTH_PX + OUTLINER_ICON_SLOT_PX;

/** Resolved drop after vertical placement and horizontal elevation. */
export interface OutlinerResolvedDrop<T> {
  /** Object that receives the drop (may be an ancestor of the hovered row). */
  target: T;
  /** Placement relative to {@link target}. */
  placement: OutlinerDropPlacement;
  /**
   * Row used for insert-line geometry (hovered for after, elevated for
   * before/into).
   */
  visualTarget: T;
  /** Hierarchy depth of the insert (shortens the orange line). */
  insertDepth: number;
}

/**
 * Resolves where a drop lands on a row from the pointer Y and whether the row
 * can accept children (groups). Leaf rows use a simple half-split; container
 * rows reserve a middle band for nesting into the target.
 *
 * @param clientY Pointer Y in viewport coordinates.
 * @param rowTop Top edge of the row in viewport coordinates.
 * @param rowHeight Row height in CSS pixels.
 * @param canAcceptChildren True when dropping in the middle nests under the
 *   row.
 * @returns Placement for the insert line and reparent destination.
 */
export function resolveOutlinerDropPlacement(
  clientY: number,
  rowTop: number,
  rowHeight: number,
  canAcceptChildren: boolean,
): OutlinerDropPlacement {
  if (!Number.isFinite(clientY) || !Number.isFinite(rowTop) || rowHeight <= 0) {
    return 'before';
  }
  const localY = clientY - rowTop;
  if (canAcceptChildren) {
    return resolveContainerRowPlacement(localY, rowHeight);
  }
  return resolveLeafRowPlacement(localY, rowHeight);
}

/**
 * Left edge of a row's depth padding relative to the tree host content origin.
 *
 * @param depth Hierarchy depth starting at 0 for root children.
 * @returns CSS pixel offset from the tree host left padding edge.
 */
export function outlinerRowDepthOffsetPx(depth: number): number {
  const safeDepth = Math.max(0, depth);
  return OUTLINER_TREE_PADDING_PX + OUTLINER_BASE_PADDING_PX + safeDepth * OUTLINER_INDENT_PX;
}

/**
 * Minimum local X (from tree host left) required to claim insert depth {@code
 * depth}. Uses only the row's depth padding start so chevron and icon on a
 * nested row still count as that row's depth. Moving left of a row's indent
 * elevates one level (inserted into the parent after its last open child).
 *
 * @param depth Hierarchy depth to claim.
 * @returns Local X threshold in CSS pixels.
 */
export function outlinerIndentDepthClaimMinX(depth: number): number {
  if (depth <= 0) return 0;
  return outlinerRowDepthOffsetPx(depth);
}

/**
 * Maps pointer X to a hierarchy indent depth. A nested row's chevron, icon, and
 * name all keep that row's depth. Only the gutter left of the row indent claims
 * a shallower parent insert.
 *
 * @param clientX Pointer X in viewport coordinates.
 * @param treeContentLeft Left edge of the tree host in viewport coords.
 * @param maxDepth Deepest depth the hovered row may elevate from (its depth).
 * @returns Depth in {@code [0, maxDepth]}.
 */
export function resolveOutlinerIndentDepth(clientX: number, treeContentLeft: number, maxDepth: number): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(treeContentLeft) || maxDepth < 0) {
    return 0;
  }
  const localX = clientX - treeContentLeft;
  let depth = 0;
  for (let candidate = 1; candidate <= maxDepth; candidate++) {
    if (localX < outlinerIndentDepthClaimMinX(candidate)) break;
    depth = candidate;
  }
  return depth;
}

/**
 * Maps a pointer Y to a visible row index using fixed row height. Used as a
 * fallback when {@link Document.elementsFromPoint} hits tree chrome/gaps.
 *
 * @param clientY Pointer Y in viewport coordinates.
 * @param treeTop Tree host top edge in viewport coordinates.
 * @param scrollTop Tree host scrollTop in CSS pixels.
 * @param rowCount Number of visible outliner rows.
 * @returns Clamped row index, or null when the list is empty.
 */
export function outlinerRowIndexFromClientYResolve(
  clientY: number,
  treeTop: number,
  scrollTop: number,
  rowCount: number,
): number | null {
  if (rowCount <= 0 || !Number.isFinite(clientY) || !Number.isFinite(treeTop)) {
    return null;
  }
  const yInContent = clientY - treeTop + scrollTop - OUTLINER_TREE_PADDING_PX;
  const rawIndex = Math.floor(yInContent / OUTLINER_ROW_HEIGHT_PX);
  if (!Number.isFinite(rawIndex)) {
    return null;
  }
  return Math.max(0, Math.min(rowCount - 1, rawIndex));
}

/**
 * Viewport Y of the top edge of a visible row using fixed row geometry.
 *
 * @param rowIndex Zero-based visible row index.
 * @param treeTop Tree host top edge in viewport coordinates.
 * @param scrollTop Tree host scrollTop in CSS pixels.
 * @returns Row top in viewport coordinates.
 */
export function outlinerRowTopFromIndexResolve(rowIndex: number, treeTop: number, scrollTop: number): number {
  return treeTop + OUTLINER_TREE_PADDING_PX + rowIndex * OUTLINER_ROW_HEIGHT_PX - scrollTop;
}

/**
 * Host-content Y of an insert line for a visible row edge.
 *
 * @param rowIndex Zero-based visible row index.
 * @param placement Before uses the row top edge; after uses the bottom edge.
 * @returns Y relative to the tree host content origin (includes scroll).
 */
export function outlinerInsertLineHostLocalYResolve(rowIndex: number, placement: 'before' | 'after'): number {
  const rowTopInContent = OUTLINER_TREE_PADDING_PX + rowIndex * OUTLINER_ROW_HEIGHT_PX;
  if (placement === 'after') {
    return rowTopInContent + OUTLINER_ROW_HEIGHT_PX;
  }
  return rowTopInContent;
}

/**
 * Scroll delta for drag auto-scroll from pointer position in the tree viewport.
 * Combines a high-power position ease-in with a hold-time ramp so speed stays
 * gentle until the pointer has lingered in the edge band. Values are per
 * frame.
 *
 * @param clientY Pointer Y in viewport coordinates.
 * @param treeTop Tree host top edge in viewport coordinates.
 * @param treeBottom Tree host bottom edge in viewport coordinates.
 * @param holdDurationMs How long the pointer has stayed in an edge band.
 * @returns Signed scroll delta in CSS pixels (negative scrolls up), or 0.
 */
export function outlinerDragEdgeScrollDeltaResolve(
  clientY: number,
  treeTop: number,
  treeBottom: number,
  holdDurationMs: number = OUTLINER_DRAG_SCROLL_HOLD_RAMP_MS,
): number {
  if (!Number.isFinite(clientY) || !Number.isFinite(treeTop) || !Number.isFinite(treeBottom)) {
    return 0;
  }
  const holdFactor = outlinerDragEdgeScrollHoldFactorResolve(holdDurationMs);
  if (holdFactor <= 0) {
    return 0;
  }
  const topDelta = outlinerDragEdgeBandDeltaResolve(clientY - treeTop, -1, holdFactor);
  if (topDelta !== 0) {
    return topDelta;
  }
  return outlinerDragEdgeBandDeltaResolve(treeBottom - clientY, 1, holdFactor);
}

/**
 * Returns whether the pointer Y is inside a drag edge-scroll band.
 *
 * @param clientY Pointer Y in viewport coordinates.
 * @param treeTop Tree host top edge in viewport coordinates.
 * @param treeBottom Tree host bottom edge in viewport coordinates.
 * @returns True when edge auto-scroll may run.
 */
export function outlinerDragEdgeScrollBandContains(clientY: number, treeTop: number, treeBottom: number): boolean {
  if (!Number.isFinite(clientY) || !Number.isFinite(treeTop) || !Number.isFinite(treeBottom)) {
    return false;
  }
  if (clientY - treeTop < OUTLINER_DRAG_SCROLL_EDGE_PX) {
    return true;
  }
  return treeBottom - clientY < OUTLINER_DRAG_SCROLL_EDGE_PX;
}

/**
 * Converts distance into an edge band into a signed multi-row scroll step.
 *
 * @param distanceFromEdge Distance from the tree edge toward the center.
 * @param scrollSign Negative scrolls up; positive scrolls down.
 * @param holdFactor Normalized hold ramp in [0, 1].
 * @returns Signed scroll delta in CSS pixels, or 0 outside the band.
 */
function outlinerDragEdgeBandDeltaResolve(distanceFromEdge: number, scrollSign: number, holdFactor: number): number {
  if (distanceFromEdge >= OUTLINER_DRAG_SCROLL_EDGE_PX) {
    return 0;
  }
  const linearIntensity = 1 - Math.max(0, distanceFromEdge) / OUTLINER_DRAG_SCROLL_EDGE_PX;
  const easedIntensity = outlinerDragEdgeScrollEaseInPower(linearIntensity) * holdFactor;
  const rowSpan = OUTLINER_DRAG_SCROLL_MAX_ROWS - OUTLINER_DRAG_SCROLL_MIN_ROWS;
  const rows = OUTLINER_DRAG_SCROLL_MIN_ROWS + rowSpan * easedIntensity;
  const pixels = Math.round(rows * OUTLINER_ROW_HEIGHT_PX);
  if (pixels <= 0) {
    return 0;
  }
  return scrollSign * pixels;
}

/**
 * Hold-time ramp for drag edge scroll (ease-in over
 * {@link OUTLINER_DRAG_SCROLL_HOLD_RAMP_MS}).
 *
 * @param holdDurationMs Time spent continuously in an edge band.
 * @returns Factor in [0, 1].
 */
export function outlinerDragEdgeScrollHoldFactorResolve(holdDurationMs: number): number {
  if (!Number.isFinite(holdDurationMs) || holdDurationMs <= 0) {
    return 0;
  }
  const linear = Math.min(1, holdDurationMs / OUTLINER_DRAG_SCROLL_HOLD_RAMP_MS);
  return linear * linear;
}

/**
 * High-power ease-in for drag edge scroll intensity. Keeps early motion subtle
 * and reserves high speed for the outer extreme of the band.
 *
 * @param linearIntensity Normalized intensity in [0, 1] (0 = inner, 1 = outer).
 * @returns Eased intensity in [0, 1].
 */
export function outlinerDragEdgeScrollEaseInPower(linearIntensity: number): number {
  if (!Number.isFinite(linearIntensity) || linearIntensity <= 0) {
    return 0;
  }
  if (linearIntensity >= 1) {
    return 1;
  }
  return Math.pow(linearIntensity, OUTLINER_DRAG_SCROLL_EASE_POWER);
}

/**
 * Host-local Y of an insert line for a visible row edge, relative to the
 * viewport (scroll offset subtracted so the marker stays on screen).
 *
 * @param rowIndex Zero-based logical row index.
 * @param placement Before uses the row top edge; after uses the bottom edge.
 * @param scrollOffsetPx Virtual or native scroll offset in CSS pixels.
 * @returns Y relative to the tree host padding box.
 */
export function outlinerInsertLineViewportLocalYResolve(
  rowIndex: number,
  placement: 'before' | 'after',
  scrollOffsetPx: number,
): number {
  return outlinerInsertLineHostLocalYResolve(rowIndex, placement) - scrollOffsetPx;
}

/**
 * Estimated left inset of a row name column at the given hierarchy depth (depth
 * padding + chevron + icon). Used so insert lines can align to parent text such
 * as the "G" in "Group".
 *
 * @param nameDepth Hierarchy depth of the row whose name anchors the line.
 * @returns Left offset in CSS pixels from the tree host content origin.
 */
export function outlinerInsertLineLeftPx(nameDepth: number): number {
  return outlinerRowDepthOffsetPx(Math.max(0, nameDepth)) + OUTLINER_LEADING_CHROME_PX;
}

/**
 * Hierarchy depth of the name column that should anchor a before/after insert
 * line. Sibling inserts under a parent align to that parent's text, not the
 * nested row text (e.g. after Brush1 under Group starts at "Group").
 *
 * @param targetDepth Depth of the elevated drop target row.
 * @returns Parent depth for the line, or -1 when the target is root-level
 *   (full-width line; no visible parent name).
 */
export function outlinerInsertLineNameDepthForTargetDepth(targetDepth: number): number {
  if (targetDepth <= 0) {
    return -1;
  }
  return targetDepth - 1;
}

/**
 * Left inset and width for the insert line. Prefer {@code nameColumnLeftPx}
 * when provided (including depth-0 parent names). When it is null, {@code
 * insertDepth <= 0} means a full-width root line; deeper depths fall back to
 * the estimated name column at that depth.
 *
 * @param hostWidth Tree host client width in CSS pixels.
 * @param insertDepth Depth used only as fallback when name left is null.
 * @param nameColumnLeftPx Optional measured or estimated name-column left.
 * @returns Integer left offset and line width inside the host.
 */
export function resolveOutlinerInsertLineGeometry(
  hostWidth: number,
  insertDepth: number,
  nameColumnLeftPx: number | null = null,
): { left: number; width: number } {
  const safeHostWidth = Math.max(0, Math.floor(hostWidth));
  if (nameColumnLeftPx !== null && Number.isFinite(nameColumnLeftPx)) {
    const left = clampOutlinerInsertLineLeft(nameColumnLeftPx, safeHostWidth);
    return { left, width: safeHostWidth - left };
  }
  if (insertDepth <= 0) {
    return { left: 0, width: safeHostWidth };
  }
  const left = clampOutlinerInsertLineLeft(outlinerInsertLineLeftPx(insertDepth), safeHostWidth);
  return { left, width: safeHostWidth - left };
}

/**
 * Rounds and clamps insert-line left so it stays within the host width.
 *
 * @param rawLeft Unrounded left offset in CSS pixels.
 * @param hostWidth Integer host client width in CSS pixels.
 * @returns Integer left in {@code [0, hostWidth]}.
 */
function clampOutlinerInsertLineLeft(rawLeft: number, hostWidth: number): number {
  return Math.min(hostWidth, Math.max(0, Math.round(rawLeft)));
}

/**
 * When the pointer is on the bottom edge of an expanded parent, the gap looks
 * like "between parent and its children". That must insert as the first child
 * under the parent — never as a full-width sibling after the parent.
 *
 * @param hovered Row under the pointer.
 * @param hoveredDepth Depth of the hovered row.
 * @param placement Vertical placement on the hovered row.
 * @param isExpandedContainer True when the row is an open container with kids.
 * @param getFirstContentChild First content child of a container, or null.
 * @returns Target, depth, and placement after remapping expanded-parent after.
 */
export function remapAfterOnExpandedContainer<T>(
  hovered: T,
  hoveredDepth: number,
  placement: OutlinerDropPlacement,
  isExpandedContainer: (node: T) => boolean,
  getFirstContentChild: (node: T) => T | null,
): { target: T; depth: number; placement: OutlinerDropPlacement } {
  if (placement !== 'after') {
    return { target: hovered, depth: hoveredDepth, placement };
  }
  if (!isExpandedContainer(hovered)) {
    return { target: hovered, depth: hoveredDepth, placement };
  }
  const firstChild = getFirstContentChild(hovered);
  if (!firstChild) {
    return { target: hovered, depth: hoveredDepth, placement: 'into' };
  }
  return { target: firstChild, depth: hoveredDepth + 1, placement: 'before' };
}

/**
 * Elevates an after-drop from a nested row to an ancestor when the pointer
 * indent is shallower. Only walks through last content children so a drop after
 * the final open descendant can land beside the parent (e.g. after an expanded
 * solid), and stops below the first ancestor the dragged object may not follow
 * as a sibling, so the shallowest valid depth absorbs the gutter left of it.
 * Before/into placements never elevate — hovering before the first child with
 * the pointer left must stay as "before that child" under the parent, not a
 * full-width root sibling of the parent.
 *
 * @param hovered Row object under the pointer.
 * @param hoveredDepth Indent depth of the hovered row.
 * @param placement Vertical placement on the hovered row.
 * @param desiredDepth Indent depth from pointer X.
 * @param getParent Parent of a node, or null at the tree root.
 * @param isLastContentChild True when node is the last content child of parent.
 * @param canDropAfter True when the dragged object may land right after a node.
 * @returns Elevated target and its hierarchy depth.
 */
export function elevateOutlinerDropTarget<T>(
  hovered: T,
  hoveredDepth: number,
  placement: OutlinerDropPlacement,
  desiredDepth: number,
  getParent: (node: T) => T | null,
  isLastContentChild: (node: T) => boolean,
  canDropAfter: (node: T) => boolean = () => true,
): { target: T; depth: number } {
  if (placement !== 'after') return { target: hovered, depth: hoveredDepth };
  let current = hovered;
  let depth = hoveredDepth;
  while (depth > desiredDepth) {
    const parent = getParent(current);
    if (!parent || !isLastContentChild(current) || !canDropAfter(parent)) break;
    current = parent;
    depth -= 1;
  }
  return { target: current, depth };
}

/**
 * Picks which row anchors the insert-line after elevation. After stays on the
 * hovered leaf (end of an expanded block); before/into use the elevated
 * target.
 *
 * @param elevated Elevated drop target.
 * @param hovered Row under the pointer.
 * @param placement Drop placement.
 * @returns Object whose row should show the insert feedback.
 */
export function pickOutlinerDropVisualTarget<T>(elevated: T, hovered: T, placement: OutlinerDropPlacement): T {
  if (placement === 'after') return hovered;
  return elevated;
}

/**
 * Resolves full drop target, placement, and visual row from hover geometry.
 *
 * @param hovered Row object under the pointer.
 * @param hoveredDepth Indent depth of the hovered row.
 * @param clientX Pointer X in viewport coordinates.
 * @param clientY Pointer Y in viewport coordinates.
 * @param rowTop Top of the hovered row in viewport coordinates.
 * @param rowHeight Height of the hovered row.
 * @param treeContentLeft Left edge of the tree content box.
 * @param canAcceptChildren Whether the hovered row can nest children.
 * @param getParent Parent of a node, or null at the tree root.
 * @param isLastContentChild Last-content-child predicate.
 * @param isExpandedContainer Expanded-container predicate for after remapping.
 * @param getFirstContentChild First content child of a container.
 * @param canDropAfter True when the dragged object may land right after a node.
 * @returns Elevated target, placement, visual row, and insert depth.
 */
export function resolveOutlinerDropTarget<T>(
  hovered: T,
  hoveredDepth: number,
  clientX: number,
  clientY: number,
  rowTop: number,
  rowHeight: number,
  treeContentLeft: number,
  canAcceptChildren: boolean,
  getParent: (node: T) => T | null,
  isLastContentChild: (node: T) => boolean,
  isExpandedContainer: (node: T) => boolean = () => false,
  getFirstContentChild: (node: T) => T | null = () => null,
  canDropAfter: (node: T) => boolean = () => true,
): OutlinerResolvedDrop<T> {
  const rawPlacement = resolveOutlinerDropPlacement(clientY, rowTop, rowHeight, canAcceptChildren);
  const remapped = remapAfterOnExpandedContainer(
    hovered,
    hoveredDepth,
    rawPlacement,
    isExpandedContainer,
    getFirstContentChild,
  );
  const desiredDepth = resolveOutlinerIndentDepth(clientX, treeContentLeft, remapped.depth);
  const elevated = elevateOutlinerDropTarget(
    remapped.target,
    remapped.depth,
    remapped.placement,
    desiredDepth,
    getParent,
    isLastContentChild,
    canDropAfter,
  );
  return {
    target: elevated.target,
    placement: remapped.placement,
    visualTarget: pickOutlinerDropVisualTarget(elevated.target, remapped.target, remapped.placement),
    insertDepth: elevated.depth,
  };
}

/**
 * Places a drop on a leaf row: top half before, bottom half after.
 *
 * @param localY Pointer Y relative to the row top.
 * @param rowHeight Row height in CSS pixels.
 * @returns Before or after placement.
 */
function resolveLeafRowPlacement(localY: number, rowHeight: number): OutlinerDropPlacement {
  return localY < rowHeight * 0.5 ? 'before' : 'after';
}

/**
 * Places a drop on a container row: outer quarters reorder as siblings, middle
 * half nests as a child.
 *
 * @param localY Pointer Y relative to the row top.
 * @param rowHeight Row height in CSS pixels.
 * @returns Before, after, or into placement.
 */
function resolveContainerRowPlacement(localY: number, rowHeight: number): OutlinerDropPlacement {
  const topEdge = rowHeight * 0.25;
  const bottomEdge = rowHeight * 0.75;
  if (localY < topEdge) return 'before';
  if (localY > bottomEdge) return 'after';
  return 'into';
}
