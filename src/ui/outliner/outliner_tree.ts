import * as THREE from 'three';
import { OutlinerItem } from './outliner_item.js';
import { getDepth, getDescendants, getAllMeshes } from '../../utils/hierarchy_utils.js';
import { isEditorHelperObject } from '../../utils/mesh_edge_sync.js';
import { isObjectLocked } from '../../utils/object_lock.js';
import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';

/**
 * Callback type for tree-level selection events.
 * @param obj The Three.js object that was selected.
 * @param event The mouse event that triggered selection (for modifiers).
 */
export type TreeSelectCallback = (obj: THREE.Object3D, event?: MouseEvent) => void;

/**
 * Callback type for hierarchy reparent drop events.
 * @param dragged The object being dragged.
 * @param dropTarget The object that received the drop.
 */
export type TreeReparentCallback = (
  dragged: THREE.Object3D,
  dropTarget: THREE.Object3D
) => void;

/**
 * Callback type for tree-level visibility toggle events.
 * @param obj The Three.js object whose visibility toggled.
 */
export type TreeVisibilityCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for tree-level lock toggle events.
 * @param obj The Three.js object whose lock state toggled.
 */
export type TreeLockCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for tree-level rename events.
 * @param obj The Three.js object being renamed.
 * @param newName The new name entered by the user.
 */
export type TreeRenameCallback = (obj: THREE.Object3D, newName: string) => void;

/**
 * Callback type for tree-level context menu requests.
 * @param obj The Three.js object for the context menu.
 * @param x The horizontal screen coordinate.
 * @param y The vertical screen coordinate.
 */
export type TreeContextMenuCallback = (obj: THREE.Object3D, x: number, y: number) => void;

/**
 * Tree view component that renders a hierarchical outliner.
 * Manages expand/collapse state, search filtering, and item synchronization.
 */
export class OutlinerTree {
  private container: HTMLElement;
  private treeElement: HTMLElement;
  private searchElement: HTMLInputElement;
  private root: THREE.Object3D;
  private itemMap: Map<THREE.Object3D, OutlinerItem>;
  private expandedSet: Set<string>;
  private isDisposed: boolean;
  private searchQuery: string;
  private onSelect: TreeSelectCallback | null;
  private onVisibility: TreeVisibilityCallback | null;
  private onLock: TreeLockCallback | null;
  private onRename: TreeRenameCallback | null;
  private contextMenuCallback: TreeContextMenuCallback | null;
  private onReparent: TreeReparentCallback | null;
  private dragSource: THREE.Object3D | null;

  /**
   * Creates a new outliner tree bound to a root Three.js object.
   * @param container The parent DOM element to append the tree into.
   * @param root The root Three.js object representing the scene hierarchy.
   */
  constructor(container: HTMLElement, root: THREE.Object3D) {
    this.container = container;
    this.root = root;
    this.itemMap = new Map();
    this.expandedSet = new Set();
    this.expandedSet.add(this.root.uuid);
    this.isDisposed = false;
    this.searchQuery = '';
    this.onSelect = null;
    this.onVisibility = null;
    this.onLock = null;
    this.onRename = null;
    this.contextMenuCallback = null;
    this.onReparent = null;
    this.dragSource = null;
    this.treeElement = document.createElement('div');
    this.searchElement = document.createElement('input');
    this.buildSearchBar();
    this.buildTreeContainer();
    this.container.appendChild(this.searchElement);
    this.container.appendChild(this.treeElement);
  }

  /**
   * Returns the root Three.js object this tree is bound to.
   * @returns The root object.
   */
  getRoot(): THREE.Object3D {
    return this.root;
  }

  /**
   * Registers the callback for selection events.
   * @param callback The function to call on item selection.
   */
  onSelectObject(callback: TreeSelectCallback): void {
    this.onSelect = callback;
  }

  /**
   * Registers the callback for visibility toggle events.
   * @param callback The function to call on visibility toggle.
   */
  onToggleVisibility(callback: TreeVisibilityCallback): void {
    this.onVisibility = callback;
  }

  /**
   * Registers the callback for lock toggle events.
   * @param callback The function to call on lock toggle.
   */
  onToggleLock(callback: TreeLockCallback): void {
    this.onLock = callback;
  }

  /**
   * Registers the callback for rename events.
   * @param callback The function to call on rename completion.
   */
  onRenameObject(callback: TreeRenameCallback): void {
    this.onRename = callback;
  }

  /**
   * Registers the callback for context menu events.
   * @param callback The function to call on context menu trigger.
   */
  onContextMenu(callback: TreeContextMenuCallback): void {
    this.contextMenuCallback = callback;
  }

  /**
   * Registers the callback for hierarchy reparent drop events.
   * @param callback The function to call when an item is dropped onto another.
   */
  onReparentObject(callback: TreeReparentCallback): void {
    this.onReparent = callback;
  }

  /**
   * Refreshes the tree to match the current scene hierarchy.
   * @param selectedObjects The set of currently selected meshes.
   * @param hierarchySelection Optional hierarchy nodes selected in the outliner.
   */
  refresh(
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D> = new Set()
  ): void {
    if (this.isDisposed) return;
    this.clearItems();
    this.renderChildren(
      this.root,
      0,
      this.treeElement,
      selectedObjects,
      hierarchySelection
    );
  }

  /**
   * Updates selection highlighting without rebuilding the tree.
   * Preserves inline rename and open row DOM.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  updateSelectionStates(
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>
  ): void {
    if (this.isDisposed) return;
    this.itemMap.forEach((item, obj) => {
      item.setSelectionState(
        this.computeIsSelected(obj, selectedObjects, hierarchySelection)
      );
    });
  }

  /**
   * Toggles the expanded state of an object in the tree.
   * @param obj The Three.js object to toggle.
   */
  toggleExpand(obj: THREE.Object3D): void {
    const key = obj.uuid;
    if (this.expandedSet.has(key)) {
      this.expandedSet.delete(key);
    } else {
      this.expandedSet.add(key);
    }
    const selected = this.buildEmptySelectionSet();
    this.refresh(selected);
  }

  /**
   * Returns the currently active search query string.
   * @returns The search query.
   */
  getSearchQuery(): string {
    return this.searchQuery;
  }

  /**
   * Disposes the tree and removes all DOM elements.
   */
  dispose(): void {
    this.isDisposed = true;
    this.clearItems();
    if (this.searchElement.parentNode) {
      this.searchElement.parentNode.removeChild(this.searchElement);
    }
    if (this.treeElement.parentNode) {
      this.treeElement.parentNode.removeChild(this.treeElement);
    }
  }

  /**
   * Builds and styles the search input element.
   */
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
      this.searchQuery = this.searchElement.value;
      const selected = this.buildEmptySelectionSet();
      this.refresh(selected);
    });
  }

  /**
   * Builds and styles the tree container element.
   */
  private buildTreeContainer(): void {
    this.treeElement.style.flex = '1';
    this.treeElement.style.overflowY = 'auto';
    this.treeElement.style.padding = '4px';
  }

  /**
   * Removes all existing items from the DOM and clears state maps.
   */
  private clearItems(): void {
    this.itemMap.forEach((item) => {
      item.dispose();
    });
    this.itemMap.clear();
    this.treeElement.innerHTML = '';
  }

  /**
   * Recursively renders all children of a parent into the tree.
   * @param parent The parent Three.js object.
   * @param depth The current indentation depth level.
   * @param targetContainer The DOM element to append child items into.
   * @param selectedObjects The set of currently selected meshes.
   */
  private renderChildren(
    parent: THREE.Object3D,
    depth: number,
    targetContainer: HTMLElement,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>
  ): void {
    const query = this.searchQuery.toLowerCase();
    this.getContentChildren(parent).forEach((child) => {
      if (!this.passesSearchFilter(child, query)) return;
      const hasChildren = this.getContentChildren(child).length > 0;
      const item = new OutlinerItem(child, depth, hasChildren);
      this.applySelectionState(
        item,
        child,
        selectedObjects,
        hierarchySelection
      );
      this.applyExpandedState(item, child);
      this.applyVisibilityState(item, child);
      this.applyLockState(item, child);
      this.bindItemCallbacks(item);
      targetContainer.appendChild(item.getElement());
      this.itemMap.set(child, item);
      if (hasChildren && this.expandedSet.has(child.uuid)) {
        this.renderChildren(
          child,
          depth + 1,
          targetContainer,
          selectedObjects,
          hierarchySelection
        );
      }
    });
  }

  /**
   * Returns hierarchy children that are real content, not editor helpers.
   * Hides decorative edges, selection outlines, and similar internals.
   * @param parent Parent object.
   * @returns Content children only.
   */
  private getContentChildren(parent: THREE.Object3D): THREE.Object3D[] {
    return parent.children.filter((child) => !isEditorHelperObject(child));
  }

  /**
   * Checks whether an object passes the current search filter.
   * @param obj The object to test.
   * @param query The lowercase search query string.
   * @returns True if the object matches or has matching descendants.
   */
  private passesSearchFilter(obj: THREE.Object3D, query: string): boolean {
    if (!query) return true;
    const nameMatch = (obj.name || '').toLowerCase().includes(query);
    if (nameMatch) return true;
    const descendants = getDescendants(obj);
    return descendants.some((d) => (d.name || '').toLowerCase().includes(query));
  }

  /**
   * Applies the selection highlight to an item based on mesh and hierarchy selection.
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   * @param selectedObjects The set of selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  private applySelectionState(
    item: OutlinerItem,
    obj: THREE.Object3D,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>
  ): void {
    item.setSelectionState(
      this.computeIsSelected(obj, selectedObjects, hierarchySelection)
    );
  }

  /**
   * Computes whether a hierarchy row should appear selected.
   * Empty groups are selected only via hierarchy selection.
   * @param obj Row object.
   * @param selectedObjects Selected meshes.
   * @param hierarchySelection Outliner hierarchy selection.
   * @returns True when the row should highlight.
   */
  private computeIsSelected(
    obj: THREE.Object3D,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>
  ): boolean {
    if (hierarchySelection.has(obj)) return true;
    if (obj instanceof THREE.Mesh) return selectedObjects.has(obj);
    if (obj instanceof THREE.Group) {
      const meshes = getAllMeshes(obj);
      if (meshes.length === 0) return false;
      return meshes.some((mesh) => selectedObjects.has(mesh));
    }
    return false;
  }

  /**
   * Applies the expanded state to an item based on the expanded set.
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyExpandedState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setExpandedState(this.expandedSet.has(obj.uuid));
  }

  /**
   * Applies the visibility state to an item from the object's visible property.
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyVisibilityState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setVisibilityState(obj.visible);
  }

  /**
   * Applies the lock state to an item from the object's lock userData.
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyLockState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setLockState(isObjectLocked(obj));
  }

  /**
   * Binds all callback handlers to an outliner item.
   * @param item The item to bind callbacks to.
   */
  private bindItemCallbacks(item: OutlinerItem): void {
    item.onSelection((obj, event) => {
      if (this.onSelect) {
        this.onSelect(obj, event);
      }
    });
    item.onVisibilityToggle((obj) => {
      if (this.onVisibility) {
        this.onVisibility(obj);
      }
    });
    item.onLockToggle((obj) => {
      if (this.onLock) {
        this.onLock(obj);
      }
    });
    item.onExpandToggle((obj) => {
      this.toggleExpand(obj);
    });
    item.onRenameRequest((obj, newName) => {
      if (this.onRename) {
        this.onRename(obj, newName);
      }
    });
    item.onContextMenuRequest((obj, x, y) => {
      if (this.contextMenuCallback) {
        this.contextMenuCallback(obj, x, y);
      }
    });
    item.onDragStartRequest((obj) => {
      this.dragSource = obj;
    });
    item.onDropRequest((target) => {
      this.handleItemDrop(target);
    });
  }

  /**
   * Completes a drag-and-drop reparent when a valid drop target is hit.
   * @param target The object that received the drop.
   */
  private handleItemDrop(target: THREE.Object3D): void {
    if (!this.dragSource || !this.onReparent) {
      this.dragSource = null;
      return;
    }
    if (this.dragSource === target) {
      this.dragSource = null;
      return;
    }
    this.onReparent(this.dragSource, target);
    this.dragSource = null;
  }

  /**
   * Creates an empty set for mesh selection.
   * @returns An empty set of Three.js Mesh objects.
   */
  private buildEmptySelectionSet(): Set<THREE.Mesh> {
    return new Set();
  }
}
