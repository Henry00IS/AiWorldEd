import * as THREE from 'three';
import { OutlinerItem, type OutlinerRemoteHolderResolver } from './outliner_item.js';
import { isObjectLocked } from '@/utils/object_lock.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { OutlinerTreeDragSession } from './outliner_tree_drag_session.js';
import {
  computeOutlinerDepth,
  getOutlinerContentChildren,
  outlinerPassesSearchFilter,
} from './outliner_tree_hierarchy.js';
import { computeOutlinerRowSelected } from './outliner_tree_selection.js';
import { OutlinerVirtualList } from './outliner_virtual_list.js';
import type {
  TreeContextMenuCallback,
  TreeLockCallback,
  TreeRenameCallback,
  TreeReparentCallback,
  TreeSelectCallback,
  TreeVisibilityCallback,
} from './outliner_tree_types.js';

export type {
  TreeContextMenuCallback,
  TreeLockCallback,
  TreeRenameCallback,
  TreeReparentCallback,
  TreeSelectCallback,
  TreeVisibilityCallback,
} from './outliner_tree_types.js';

/**
 * Tree view component that renders a hierarchical outliner. Manages
 * expand/collapse state, search filtering, and virtualized item rows.
 */
export class OutlinerTree {
  private container: HTMLElement;
  private treeElement: HTMLElement;
  private searchElement: HTMLInputElement;
  private root: THREE.Object3D;
  private expandedSet: Set<string>;
  /**
   * UUIDs that already received a default expand/collapse policy (user choice
   * sticks).
   */
  private expandPolicyInitialized: Set<string>;
  private isDisposed: boolean;
  private searchQuery: string;
  private onSelect: TreeSelectCallback | null;
  private onVisibility: TreeVisibilityCallback | null;
  private onLock: TreeLockCallback | null;
  private onRename: TreeRenameCallback | null;
  private contextMenuCallback: TreeContextMenuCallback | null;
  private onReparent: TreeReparentCallback | null;
  private readonly dragSession: OutlinerTreeDragSession;
  private readonly virtualList: OutlinerVirtualList;
  private lastSelectedObjects: Set<THREE.Mesh>;
  private lastHierarchySelection: Set<THREE.Object3D>;
  private lastLogicalObjects: THREE.Object3D[];
  private remoteHolderResolver: OutlinerRemoteHolderResolver | null = null;

  /**
   * Creates a new outliner tree bound to a root Three.js object.
   *
   * @param container The parent DOM element to append the tree into.
   * @param root The root Three.js object representing the scene hierarchy.
   */
  constructor(container: HTMLElement, root: THREE.Object3D) {
    this.container = container;
    this.root = root;
    this.expandedSet = new Set();
    this.expandedSet.add(this.root.uuid);
    this.expandPolicyInitialized = new Set();
    this.expandPolicyInitialized.add(this.root.uuid);
    this.isDisposed = false;
    this.searchQuery = '';
    this.onSelect = null;
    this.onVisibility = null;
    this.onLock = null;
    this.onRename = null;
    this.contextMenuCallback = null;
    this.onReparent = null;
    this.lastSelectedObjects = new Set();
    this.lastHierarchySelection = new Set();
    this.lastLogicalObjects = [];
    this.treeElement = document.createElement('div');
    this.searchElement = document.createElement('input');
    this.buildSearchBar();
    this.buildTreeContainer();
    this.dragSession = new OutlinerTreeDragSession({
      getRoot: () => this.root,
      getTreeElement: () => this.treeElement,
      getItemMap: () => this.virtualList.itemMapGet(),
      getLogicalObjects: () => this.virtualList.logicalObjectsGet(),
      getScrollOffsetPx: () => this.virtualList.scrollOffsetPxGet(),
      scrollByDeltaPx: (deltaY) => this.virtualList.scrollByDeltaPx(deltaY),
      getObjectDepth: (object) => computeOutlinerDepth(object, this.root),
      isExpanded: (uuid) => this.expandedSet.has(uuid),
      getContentChildren: (parent) => getOutlinerContentChildren(parent),
      getOnReparent: () => this.onReparent,
    });
    this.virtualList = new OutlinerVirtualList(
      this.treeElement,
      () => this.poolSlotCreate(),
      (item, object) => this.poolSlotChromeApply(item, object),
    );
    this.dragSession.treeHostDropTargetBind(this.treeElement);
    this.dragSession.insertIndicatorAttach(this.treeElement);
    this.container.appendChild(this.searchElement);
    this.container.appendChild(this.treeElement);
  }

  /**
   * Returns the root Three.js object this tree is bound to.
   *
   * @returns The root object.
   */
  getRoot(): THREE.Object3D {
    return this.root;
  }

  /**
   * Registers the callback for selection events.
   *
   * @param callback The function to call on item selection.
   */
  onSelectObject(callback: TreeSelectCallback): void {
    this.onSelect = callback;
  }

  /**
   * Registers the callback for visibility toggle events.
   *
   * @param callback The function to call on visibility toggle.
   */
  onToggleVisibility(callback: TreeVisibilityCallback): void {
    this.onVisibility = callback;
  }

  /**
   * Registers the callback for lock toggle events.
   *
   * @param callback The function to call on lock toggle.
   */
  onToggleLock(callback: TreeLockCallback): void {
    this.onLock = callback;
  }

  /**
   * Registers the callback for rename events.
   *
   * @param callback The function to call on rename completion.
   */
  onRenameObject(callback: TreeRenameCallback): void {
    this.onRename = callback;
  }

  /**
   * Registers the callback for context menu events.
   *
   * @param callback The function to call on context menu trigger.
   */
  onContextMenu(callback: TreeContextMenuCallback): void {
    this.contextMenuCallback = callback;
  }

  /**
   * Registers the callback for hierarchy reparent drop events.
   *
   * @param callback The function to call when an item is dropped onto another.
   */
  onReparentObject(callback: TreeReparentCallback): void {
    this.onReparent = callback;
  }

  /**
   * Returns the insert indicator element for tests.
   *
   * @returns Indicator element.
   */
  getInsertIndicatorForTests(): HTMLElement {
    return this.dragSession.insertIndicatorElementGet();
  }

  /**
   * Refreshes the tree to match the current scene hierarchy.
   *
   * @param selectedObjects The set of currently selected meshes.
   * @param hierarchySelection Optional hierarchy nodes selected in the
   *   outliner.
   */
  refresh(selectedObjects: Set<THREE.Mesh>, hierarchySelection: Set<THREE.Object3D> = new Set()): void {
    if (this.isDisposed) {
      return;
    }
    this.lastSelectedObjects = selectedObjects;
    this.lastHierarchySelection = hierarchySelection;
    const desired = this.collectVisibleContentObjects();
    this.lastLogicalObjects = desired;
    this.virtualList.logicalObjectsSet(desired);
  }

  /**
   * Sets the collaborator lookup used to mark rows held by other users and
   * repaints visible rows.
   *
   * @param resolver Holder lookup, or null when not in a collaboration room.
   */
  remoteHolderResolverSet(resolver: OutlinerRemoteHolderResolver | null): void {
    this.remoteHolderResolver = resolver;
    if (!this.isDisposed) this.virtualList.visibleChromeRefresh();
  }

  /**
   * Updates selection highlighting without rebuilding the logical list.
   *
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  updateSelectionStates(selectedObjects: Set<THREE.Mesh>, hierarchySelection: Set<THREE.Object3D>): void {
    if (this.isDisposed) {
      return;
    }
    this.lastSelectedObjects = selectedObjects;
    this.lastHierarchySelection = hierarchySelection;
    this.virtualList.visibleChromeRefresh();
  }

  /**
   * Expands ancestor groups, refreshes if needed, and scrolls to the object
   * row.
   *
   * @param focusObject Mesh or hierarchy node to reveal.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  revealObject(
    focusObject: THREE.Object3D,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): void {
    if (this.isDisposed) {
      return;
    }
    const expanded = this.expandAncestorsOf(focusObject);
    if (expanded || !this.logicalObjectContains(focusObject)) {
      this.refresh(selectedObjects, hierarchySelection);
    } else {
      this.updateSelectionStates(selectedObjects, hierarchySelection);
    }
    this.scrollToObject(focusObject);
  }

  /**
   * Expands every ancestor of an object up to (and including) the tree root.
   *
   * @param obj Object whose ancestors should be expanded.
   * @returns True when the expanded set changed.
   */
  expandAncestorsOf(obj: THREE.Object3D): boolean {
    let changed = false;
    if (!this.expandedSet.has(this.root.uuid)) {
      this.expandedSet.add(this.root.uuid);
      changed = true;
    }
    let current: THREE.Object3D | null = obj.parent;
    while (current) {
      if (!this.expandedSet.has(current.uuid)) {
        this.expandedSet.add(current.uuid);
        changed = true;
      }
      if (current === this.root) {
        break;
      }
      current = current.parent;
    }
    return changed;
  }

  /**
   * Scrolls the tree so the row for an object is visible.
   *
   * @param obj Object whose outliner row should scroll into view.
   */
  scrollToObject(obj: THREE.Object3D): void {
    this.virtualList.scrollToObject(obj);
  }

  /**
   * Toggles the expanded state of an object in the tree.
   *
   * @param obj The Three.js object to toggle.
   */
  toggleExpand(obj: THREE.Object3D): void {
    const key = obj.uuid;
    this.expandPolicyInitialized.add(key);
    if (this.expandedSet.has(key)) {
      this.expandedSet.delete(key);
    } else {
      this.expandedSet.add(key);
    }
    this.refresh(this.lastSelectedObjects, this.lastHierarchySelection);
  }

  /**
   * Copies expand/collapse state from a source hierarchy root onto a clone with
   * matching content structure. Used after duplicate so a closed group stays
   * closed on the clone (default policy would otherwise open new groups).
   *
   * @param sourceRoot Source hierarchy root that was duplicated.
   * @param cloneRoot Clone hierarchy root with the same content child shape.
   */
  copyExpandStateFromSource(sourceRoot: THREE.Object3D, cloneRoot: THREE.Object3D): void {
    this.copyExpandStateNodePair(sourceRoot, cloneRoot);
  }

  /**
   * Returns whether a node uuid is currently expanded.
   *
   * @param uuid Object uuid.
   * @returns True when the node is in the expanded set.
   */
  isExpandedUuid(uuid: string): boolean {
    return this.expandedSet.has(uuid);
  }

  /**
   * Returns the currently active search query string.
   *
   * @returns The search query.
   */
  getSearchQuery(): string {
    return this.searchQuery;
  }

  /** Disposes the tree and removes all DOM elements. */
  dispose(): void {
    this.isDisposed = true;
    this.dragSession.dragSessionEnd();
    this.virtualList.dispose();
    if (this.searchElement.parentNode) {
      this.searchElement.parentNode.removeChild(this.searchElement);
    }
    if (this.treeElement.parentNode) {
      this.treeElement.parentNode.removeChild(this.treeElement);
    }
  }

  /**
   * Returns the number of logical content rows (not DOM pool size).
   *
   * @returns Logical row count for tests and layout helpers.
   */
  getVisibleRowCountForTests(): number {
    return this.virtualList.logicalRowCountGet();
  }

  /**
   * Returns the virtual row pool size for tests.
   *
   * @returns Number of recycled DOM row widgets.
   */
  getPoolSizeForTests(): number {
    return this.virtualList.poolSizeGetForTests();
  }

  /**
   * Returns outliner row elements currently in the DOM (pool slots).
   *
   * @returns Row HTML elements in pool order.
   */
  getRowElementsForTests(): HTMLElement[] {
    return Array.from(this.treeElement.querySelectorAll('.editor-outliner-row')) as HTMLElement[];
  }

  /**
   * Returns whether a logical object is present in the last collected list.
   *
   * @param object Hierarchy object to look up.
   * @returns True when the object is in the logical list.
   */
  private logicalObjectContains(object: THREE.Object3D): boolean {
    return this.lastLogicalObjects.includes(object);
  }

  /**
   * Collects content objects currently visible in the outliner.
   *
   * @returns Ordered list of visible hierarchy objects.
   */
  private collectVisibleContentObjects(): THREE.Object3D[] {
    const result: THREE.Object3D[] = [];
    const query = this.searchQuery.toLowerCase();
    this.collectVisibleContentObjectsUnder(this.root, result, query);
    return result;
  }

  /**
   * Appends visible content descendants of a parent into the accumulator.
   *
   * @param parent Parent object in the hierarchy.
   * @param result Accumulator for visible objects.
   * @param query Lowercase search query (empty shows all).
   */
  private collectVisibleContentObjectsUnder(parent: THREE.Object3D, result: THREE.Object3D[], query: string): void {
    for (const child of getOutlinerContentChildren(parent)) {
      if (!outlinerPassesSearchFilter(child, query)) {
        continue;
      }
      result.push(child);
      if (getOutlinerContentChildren(child).length === 0) {
        continue;
      }
      this.applyDefaultExpandPolicy(child);
      if (this.expandedSet.has(child.uuid)) {
        this.collectVisibleContentObjectsUnder(child, result, query);
      }
    }
  }

  /**
   * Expands groups the first time they appear with children.
   *
   * @param object Hierarchy node that has content children.
   */
  private applyDefaultExpandPolicy(object: THREE.Object3D): void {
    if (this.expandPolicyInitialized.has(object.uuid)) {
      return;
    }
    this.expandPolicyInitialized.add(object.uuid);
    if (object instanceof THREE.Group) {
      this.expandedSet.add(object.uuid);
    }
  }

  /**
   * Copies expand policy for one source/clone pair, then walks content children
   * in order.
   *
   * @param source Source node.
   * @param clone Clone node at the same relative path.
   */
  private copyExpandStateNodePair(source: THREE.Object3D, clone: THREE.Object3D): void {
    const sourceChildren = getOutlinerContentChildren(source);
    const cloneChildren = getOutlinerContentChildren(clone);
    if (cloneChildren.length > 0) {
      this.applyCopiedExpandStateToClone(source, clone);
    }
    const pairCount = Math.min(sourceChildren.length, cloneChildren.length);
    for (let index = 0; index < pairCount; index++) {
      this.copyExpandStateNodePair(sourceChildren[index]!, cloneChildren[index]!);
    }
  }

  /**
   * Marks a clone container as policy-initialized and open or closed to match
   * the source.
   *
   * @param source Source container node.
   * @param clone Clone container node.
   */
  private applyCopiedExpandStateToClone(source: THREE.Object3D, clone: THREE.Object3D): void {
    this.expandPolicyInitialized.add(clone.uuid);
    if (this.resolveSourceExpandedForCopy(source)) {
      this.expandedSet.add(clone.uuid);
      return;
    }
    this.expandedSet.delete(clone.uuid);
  }

  /**
   * Resolves whether a source node should be treated as expanded when copying
   * to a clone.
   *
   * @param source Source hierarchy node.
   * @returns True when the clone should start expanded.
   */
  private resolveSourceExpandedForCopy(source: THREE.Object3D): boolean {
    if (this.expandPolicyInitialized.has(source.uuid)) {
      return this.expandedSet.has(source.uuid);
    }
    return source instanceof THREE.Group && getOutlinerContentChildren(source).length > 0;
  }

  /** Builds and styles the search input element. */
  private buildSearchBar(): void {
    this.searchElement.type = 'text';
    this.searchElement.placeholder = 'Search...';
    this.searchElement.style.display = 'block';
    this.searchElement.style.width = '100%';
    this.searchElement.style.boxSizing = 'border-box';
    this.searchElement.style.padding = '4px 8px';
    this.searchElement.style.border = 'none';
    this.searchElement.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    this.searchElement.style.background = hexToRgb(Theme.outlinerBackground);
    this.searchElement.style.color = Theme.buttonTextColor;
    this.searchElement.style.fontFamily = 'monospace';
    this.searchElement.style.fontSize = '12px';
    this.searchElement.style.outline = 'none';
    this.searchElement.addEventListener('input', () => {
      this.onSearchInputChanged();
    });
  }

  /** Applies the search box text and refreshes visible rows. */
  private onSearchInputChanged(): void {
    this.searchQuery = this.searchElement.value;
    this.refresh(this.lastSelectedObjects, this.lastHierarchySelection);
  }

  /** Builds and styles the tree container element. */
  private buildTreeContainer(): void {
    this.treeElement.style.flex = '1';
    this.treeElement.style.minHeight = '0';
    this.treeElement.style.minWidth = '0';
    this.treeElement.style.width = '100%';
    this.treeElement.style.overflow = 'hidden';
    this.treeElement.style.position = 'relative';
  }

  /**
   * Creates a pool row bound to the hierarchy root as a temporary placeholder.
   *
   * @returns Configured outliner item with callbacks bound.
   */
  private poolSlotCreate(): OutlinerItem {
    const item = new OutlinerItem(this.root, 0, false);
    this.bindItemCallbacks(item);
    item.poolVisibilitySet(false);
    return item;
  }

  /**
   * Applies depth, selection, expand, visibility, and lock chrome for a slot.
   *
   * @param item Recycled outliner row.
   * @param object Hierarchy object bound to the slot.
   */
  private poolSlotChromeApply(item: OutlinerItem, object: THREE.Object3D): void {
    const depth = computeOutlinerDepth(object, this.root);
    if (depth < 0) {
      item.poolVisibilitySet(false);
      return;
    }
    const hasChildren = getOutlinerContentChildren(object).length > 0;
    item.rebindObject(object, depth, hasChildren);
    this.applySelectionState(item, object);
    this.applyExpandedState(item, object);
    this.applyVisibilityState(item, object);
    this.applyLockState(item, object);
    if (this.remoteHolderResolver !== null) item.setRemoteHolder(this.remoteHolderResolver(object));
    else item.setRemoteHolder(null);
  }

  /**
   * Applies the selection highlight to an item based on mesh and hierarchy
   * selection.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applySelectionState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setSelectionState(computeOutlinerRowSelected(obj, this.lastSelectedObjects, this.lastHierarchySelection));
  }

  /**
   * Applies the expanded state to an item based on the expanded set.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyExpandedState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setExpandedState(this.expandedSet.has(obj.uuid));
  }

  /**
   * Applies the visibility state to an item from the object's visible property.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyVisibilityState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setVisibilityState(obj.visible);
  }

  /**
   * Applies the lock state to an item from the object's lock userData.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyLockState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setLockState(isObjectLocked(obj));
  }

  /**
   * Binds all callback handlers to an outliner item.
   *
   * @param item The item to bind callbacks to.
   */
  private bindItemCallbacks(item: OutlinerItem): void {
    this.bindSelectionCallback(item);
    this.bindVisibilityCallback(item);
    this.bindLockCallback(item);
    this.bindExpandCallback(item);
    this.bindRenameCallback(item);
    this.bindContextMenuCallback(item);
    this.dragSession.itemDragDropCallbacksBind(item);
  }

  /**
   * Binds the row selection callback.
   *
   * @param item Outliner item.
   */
  private bindSelectionCallback(item: OutlinerItem): void {
    item.onSelection((obj, event) => {
      this.onSelect?.(obj, event);
    });
  }

  /**
   * Binds the visibility toggle callback.
   *
   * @param item Outliner item.
   */
  private bindVisibilityCallback(item: OutlinerItem): void {
    item.onVisibilityToggle((obj) => {
      this.onVisibility?.(obj);
    });
  }

  /**
   * Binds the lock toggle callback.
   *
   * @param item Outliner item.
   */
  private bindLockCallback(item: OutlinerItem): void {
    item.onLockToggle((obj) => {
      this.onLock?.(obj);
    });
  }

  /**
   * Binds the expand/collapse callback.
   *
   * @param item Outliner item.
   */
  private bindExpandCallback(item: OutlinerItem): void {
    item.onExpandToggle((obj) => {
      this.toggleExpand(obj);
    });
  }

  /**
   * Binds the rename callback.
   *
   * @param item Outliner item.
   */
  private bindRenameCallback(item: OutlinerItem): void {
    item.onRenameRequest((obj, newName) => {
      this.onRename?.(obj, newName);
    });
  }

  /**
   * Binds the context menu callback.
   *
   * @param item Outliner item.
   */
  private bindContextMenuCallback(item: OutlinerItem): void {
    item.onContextMenuRequest((obj, x, y) => {
      this.contextMenuCallback?.(obj, x, y);
    });
  }
}
