import { createViewportLeafPayload, type AreaLeafPayload } from './area_editor_type.js';
import { FactoryAreaId } from './factory_area_id.js';
import { AreaLayoutDom } from './area_layout_dom.js';
import {
  cloneAreaTree,
  countAreaLeaves,
  findAreaLeafById,
  joinAreaLeaves,
  listAreaLeafPlacements,
  setSplitRatioBetweenAreas,
  splitAreaLeaf,
  type AreaLeafPlacement,
} from './area_layout_tree.js';
import { createLayoutForPaneCount, createQuadLayout } from './area_layout_presets.js';
import { checkAreaJoin } from './policy_area_join.js';
import { serializeAreaLayout, deserializeAreaLayout } from './area_layout_serializer.js';
import type { AreaSplitDirection } from './area_split_direction.js';
import { createAreaLeafNode, isAreaLeafNode, type AreaTreeNode } from './area_tree_node.js';
import type { ViewportKind } from '@/viewports/core/viewport_kind.js';

/** Callback that receives leaf placements after a layout change. */
export type AreaLayoutChangeHandler = (placements: readonly AreaLeafPlacement[]) => void;

/** Owns the area BSP tree and applies leaf placements to DOM pane containers. */
export class ControllerAreaLayout {
  private readonly layoutDom: AreaLayoutDom;
  private readonly idFactory: FactoryAreaId;
  private root: AreaTreeNode;
  private preMaximizeRoot: AreaTreeNode | null;
  private maximizedAreaId: string | null;
  private onLayoutChanged: AreaLayoutChangeHandler | null;

  /**
   * Creates a controller for a pane layer element.
   *
   * @param paneLayer Absolute host for pane chrome containers.
   * @param initialRoot Optional initial tree (defaults to classic quad).
   */
  constructor(paneLayer: HTMLElement, initialRoot: AreaTreeNode = createQuadLayout()) {
    this.layoutDom = new AreaLayoutDom(paneLayer);
    this.idFactory = new FactoryAreaId();
    this.root = initialRoot;
    this.preMaximizeRoot = null;
    this.maximizedAreaId = null;
    this.onLayoutChanged = null;
    this.idFactory.absorbExistingIds(this.collectAreaIds(this.root));
  }

  /**
   * Registers a listener invoked after structural or geometry apply.
   *
   * @param handler Callback receiving current placements.
   */
  setOnLayoutChanged(handler: AreaLayoutChangeHandler | null): void {
    this.onLayoutChanged = handler;
  }

  /**
   * Applies the current tree to DOM and notifies listeners.
   *
   * @param options.pruneMissing Detach hosts for areas no longer in the tree.
   * @returns Current leaf placements.
   */
  apply(options: { pruneMissing?: boolean } = {}): AreaLeafPlacement[] {
    const placements = listAreaLeafPlacements(this.getDisplayRoot());
    this.layoutDom.applyPlacements(placements, { pruneMissing: options.pruneMissing === true });
    this.onLayoutChanged?.(placements);
    return placements;
  }

  /**
   * Re-snaps existing pane boxes to integer CSS pixels for the current layer
   * size.
   */
  snapGeometryToPixels(): void {
    this.layoutDom.reapplyPixelGeometry();
  }

  /**
   * Replaces the live tree and applies it (clears maximize state).
   *
   * @param root New layout tree.
   * @returns Current leaf placements.
   */
  setRoot(root: AreaTreeNode): AreaLeafPlacement[] {
    this.clearMaximizeState();
    this.root = root;
    this.idFactory.absorbExistingIds(this.collectAreaIds(this.root));
    return this.apply();
  }

  /**
   * Replaces the live tree with a preset that has the given number of panes.
   *
   * @param paneCount Number of panes in the preset (1 through 4).
   * @returns Current leaf placements.
   */
  applyPaneCountPreset(paneCount: 1 | 2 | 3 | 4): AreaLeafPlacement[] {
    return this.setRoot(createLayoutForPaneCount(paneCount));
  }

  /**
   * Returns the logical tree root (ignoring temporary maximize display).
   *
   * @returns Live layout tree.
   */
  getRoot(): AreaTreeNode {
    return this.root;
  }

  /**
   * Returns placements for the currently displayed tree.
   *
   * @returns Leaf placements.
   */
  getPlacements(): AreaLeafPlacement[] {
    return listAreaLeafPlacements(this.getDisplayRoot());
  }

  /**
   * Returns the layout DOM helper that owns pane containers.
   *
   * @returns Layout DOM helper.
   */
  getLayoutDom(): AreaLayoutDom {
    return this.layoutDom;
  }

  /**
   * Returns whether the layout is currently maximized to one area.
   *
   * @returns True when maximized.
   */
  isMaximized(): boolean {
    return this.maximizedAreaId !== null;
  }

  /**
   * Returns the maximized area id when maximized.
   *
   * @returns Area id or null.
   */
  getMaximizedAreaId(): string | null {
    return this.maximizedAreaId;
  }

  /**
   * Toggles maximize for an area. Restores when the same area is toggled again.
   *
   * @param areaId Area to maximize.
   * @returns Maximized area id, or null after restore.
   */
  toggleMaximized(areaId: string): string | null {
    if (this.maximizedAreaId === areaId) {
      this.restoreFromMaximize();
      return null;
    }
    if (!findAreaLeafById(this.root, areaId)) return this.maximizedAreaId;
    if (this.preMaximizeRoot === null) {
      this.preMaximizeRoot = cloneAreaTree(this.root);
    }
    this.maximizedAreaId = areaId;
    this.apply();
    return this.maximizedAreaId;
  }

  /**
   * Toggles maximize for the area at the given index in current placement
   * order.
   *
   * @param paneIndex Zero-based index into current placements.
   * @returns Maximized area id, or null after restore / invalid index.
   */
  toggleMaximizedByIndex(paneIndex: number): string | null {
    const placements = listAreaLeafPlacements(this.root);
    const target = placements[paneIndex];
    if (!target) return this.maximizedAreaId;
    return this.toggleMaximized(target.payload.areaId);
  }

  /**
   * Splits an area into two. No-op while maximized.
   *
   * @param areaId Area to split.
   * @param direction Split axis.
   * @param ratio Fraction kept by the original area.
   * @param newViewportKind Kind for the new pane (defaults to source kind).
   * @returns New area payload, or null when split failed.
   */
  splitArea(
    areaId: string,
    direction: AreaSplitDirection,
    ratio: number,
    newViewportKind?: ViewportKind,
  ): AreaLeafPayload | null {
    if (this.maximizedAreaId !== null) return null;
    const leaf = findAreaLeafById(this.root, areaId);
    if (!leaf) return null;
    const kind = newViewportKind ?? leaf.payload.viewportKind;
    if (!kind) return null;
    const newPayload = createViewportLeafPayload(this.idFactory.nextId(), kind);
    this.root = splitAreaLeaf(this.root, areaId, direction, ratio, newPayload);
    this.apply({ pruneMissing: true });
    return newPayload;
  }

  /**
   * Joins removeId into survivorId when legal. No-op while maximized.
   *
   * @param survivorId Remaining area.
   * @param removeId Absorbed area.
   * @returns True when the join applied.
   */
  joinAreas(survivorId: string, removeId: string): boolean {
    if (this.maximizedAreaId !== null) return false;
    const check = checkAreaJoin(this.root, survivorId, removeId);
    if (!check.allowed) return false;
    const next = joinAreaLeaves(this.root, survivorId, removeId);
    if (!next) return false;
    this.root = next;
    this.apply({ pruneMissing: true });
    return true;
  }

  /**
   * Removes an area by joining it into a joinable neighbor (or fails when
   * sole).
   *
   * @param areaId Area to remove.
   * @returns Survivor id when removed, otherwise null.
   */
  removeAreaIntoNeighbor(areaId: string): string | null {
    if (this.maximizedAreaId !== null) return null;
    if (countAreaLeaves(this.root) < 2) return null;
    const neighbor = listAreaLeafPlacements(this.root).find((item) => {
      if (item.payload.areaId === areaId) return false;
      return checkAreaJoin(this.root, item.payload.areaId, areaId).allowed;
    });
    if (!neighbor) return null;
    const survivorId = neighbor.payload.areaId;
    if (!this.joinAreas(survivorId, areaId)) return null;
    return survivorId;
  }

  /**
   * Updates a split ratio when a border between two areas is dragged.
   *
   * @param firstAreaId Area on the first side of the split.
   * @param secondAreaId Area on the second side of the split.
   * @param ratio New first-child ratio.
   * @returns True when a matching split was updated.
   */
  setSplitRatioBetween(firstAreaId: string, secondAreaId: string, ratio: number): boolean {
    if (this.maximizedAreaId !== null) return false;
    const previous = this.root;
    this.root = setSplitRatioBetweenAreas(this.root, firstAreaId, secondAreaId, ratio);
    if (this.root === previous) return false;
    this.apply();
    return true;
  }

  /**
   * Updates viewport kind metadata on a leaf payload (DOM container unchanged).
   *
   * @param areaId Target area.
   * @param viewportKind New kind.
   * @returns True when updated.
   */
  setViewportKind(areaId: string, viewportKind: ViewportKind): boolean {
    const leaf = findAreaLeafById(this.root, areaId);
    if (!leaf) return false;
    leaf.payload.viewportKind = viewportKind;
    return true;
  }

  /**
   * Serializes the logical (non-maximized) tree.
   *
   * @returns Versioned layout document.
   */
  serialize(): ReturnType<typeof serializeAreaLayout> {
    return serializeAreaLayout(this.root);
  }

  /**
   * Loads a serialized layout document.
   *
   * @param value Unknown JSON.
   * @returns True when applied.
   */
  loadSerialized(value: unknown): boolean {
    const root = deserializeAreaLayout(value);
    if (!root) return false;
    this.setRoot(root);
    return true;
  }

  /**
   * Returns leaf count of the logical tree.
   *
   * @returns Number of areas.
   */
  getLeafCount(): number {
    return countAreaLeaves(this.root);
  }

  /**
   * Returns the tree shown in the DOM (maximized single leaf or full root).
   *
   * @returns Display tree.
   */
  private getDisplayRoot(): AreaTreeNode {
    if (this.maximizedAreaId === null) return this.root;
    const leaf = findAreaLeafById(this.root, this.maximizedAreaId);
    if (!leaf) return this.root;
    return createAreaLeafNode({ ...leaf.payload });
  }

  /** Restores the pre-maximize tree and clears maximize state. */
  private restoreFromMaximize(): void {
    if (this.preMaximizeRoot) {
      this.root = this.preMaximizeRoot;
    }
    this.clearMaximizeState();
    this.apply();
  }

  /** Clears maximize bookkeeping without applying. */
  private clearMaximizeState(): void {
    this.preMaximizeRoot = null;
    this.maximizedAreaId = null;
  }

  /**
   * Collects all area ids under a node.
   *
   * @param node Tree node.
   * @returns Area id list.
   */
  private collectAreaIds(node: AreaTreeNode): string[] {
    if (isAreaLeafNode(node)) return [node.payload.areaId];
    return [...this.collectAreaIds(node.first), ...this.collectAreaIds(node.second)];
  }
}
