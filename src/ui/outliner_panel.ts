import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SelectionManager } from '../managers/selection_manager.js';
import { ContextMenu, ContextMenuItem } from './context_menu.js';
import { hexToRgb } from '../utils/color_utils.js';
import { OutlinerTree } from './outliner/outliner_tree.js';
import { collectMeshesUnder } from '../utils/hierarchy_utils.js';
import { collapseToHierarchyRoots } from '../utils/hierarchy_selection.js';

/**
 * Callback type for context menu actions on outliner items.
 * @param obj The Three.js object associated with the context menu action.
 */
export type OutlinerContextCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for group action from context menu.
 * @param objects The objects to group together.
 */
export type OutlinerGroupCallback = (objects: THREE.Object3D[]) => void;

/**
 * Callback type for ungroup action from context menu.
 * @param group The group object to ungroup.
 */
export type OutlinerUngroupCallback = (group: THREE.Group) => void;

/**
 * Callback type for rename action from context menu.
 * @param obj The object to rename.
 * @param newName The new name to assign.
 */
export type OutlinerRenameCallback = (obj: THREE.Object3D, newName: string) => void;

/**
 * Callback type for visibility toggle from context menu.
 * @param obj The object whose visibility should toggle.
 */
export type OutlinerVisibilityCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for lock toggle from the outliner tree.
 * @param obj The object whose lock state should toggle.
 */
export type OutlinerLockCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for hierarchy reparent via drag-and-drop.
 * @param dragged The object being moved.
 * @param dropTarget The object that received the drop.
 */
export type OutlinerReparentCallback = (
  dragged: THREE.Object3D,
  dropTarget: THREE.Object3D
) => void;

/**
 * Hierarchical scene object panel with tree rendering.
 * Displays scene objects as a collapsible tree with type icons,
 * visibility toggles, inline rename, and context menu support.
 */
export class OutlinerPanel {
  private container: HTMLElement;
  private selectionManager: SelectionManager;
  private root: THREE.Object3D;
  private isDisposed: boolean;
  private contextMenu: ContextMenu | null;
  private tree: OutlinerTree | null;
  private duplicateCallback: OutlinerContextCallback | null;
  private deleteCallback: OutlinerContextCallback | null;
  private groupCallback: OutlinerGroupCallback | null;
  private ungroupCallback: OutlinerUngroupCallback | null;
  private renameCallback: OutlinerRenameCallback | null;
  private visibilityCallback: OutlinerVisibilityCallback | null;
  private lockCallback: OutlinerLockCallback | null;
  private reparentCallback: OutlinerReparentCallback | null;
  private hierarchySelection: Set<THREE.Object3D>;
  private isApplyingOutlinerSelection: boolean;

  /**
   * Creates a new outliner panel bound to a selection manager and scene root.
   * @param container The parent DOM element to append the panel into.
   * @param selectionManager The selection manager for tracking selection state.
   * @param root The root Three.js object representing the scene hierarchy.
   */
  constructor(
    container: HTMLElement,
    selectionManager: SelectionManager,
    root: THREE.Object3D
  ) {
    this.container = document.createElement('div');
    this.selectionManager = selectionManager;
    this.root = root;
    this.isDisposed = false;
    this.contextMenu = null;
    this.tree = null;
    this.duplicateCallback = null;
    this.deleteCallback = null;
    this.groupCallback = null;
    this.ungroupCallback = null;
    this.renameCallback = null;
    this.visibilityCallback = null;
    this.lockCallback = null;
    this.reparentCallback = null;
    this.hierarchySelection = new Set();
    this.isApplyingOutlinerSelection = false;
    this.applyContainerStyles();
    this.createTree();
    container.appendChild(this.container);
    this.selectionManager.onSelectionChanged(() => this.onMeshSelectionChanged());
  }

  /**
   * Returns hierarchy nodes to group (outermost selected outliner rows).
   * Falls back to mesh selection when hierarchy selection is empty.
   * @returns Objects to pass into GroupCommand.
   */
  getObjectsForGrouping(): THREE.Object3D[] {
    if (this.hierarchySelection.size > 0) {
      return collapseToHierarchyRoots(Array.from(this.hierarchySelection));
    }
    return this.selectionManager.getAllSelectedObjectsAsArray();
  }

  /**
   * Registers the callback for duplicate context menu actions.
   * @param callback The function to call on duplicate.
   */
  setDuplicateCallback(callback: OutlinerContextCallback | null): void {
    this.duplicateCallback = callback;
  }

  /**
   * Registers the callback for delete context menu actions.
   * @param callback The function to call on delete.
   */
  setDeleteCallback(callback: OutlinerContextCallback | null): void {
    this.deleteCallback = callback;
  }

  /**
   * Registers the callback for group context menu actions.
   * @param callback The function to call on group.
   */
  setGroupCallback(callback: OutlinerGroupCallback | null): void {
    this.groupCallback = callback;
  }

  /**
   * Registers the callback for ungroup context menu actions.
   * @param callback The function to call on ungroup.
   */
  setUngroupCallback(callback: OutlinerUngroupCallback | null): void {
    this.ungroupCallback = callback;
  }

  /**
   * Registers the callback for rename actions.
   * @param callback The function to call on rename.
   */
  setRenameCallback(callback: OutlinerRenameCallback | null): void {
    this.renameCallback = callback;
  }

  /**
   * Registers the callback for visibility toggle actions.
   * @param callback The function to call on visibility toggle.
   */
  setVisibilityCallback(callback: OutlinerVisibilityCallback | null): void {
    this.visibilityCallback = callback;
  }

  /**
   * Registers the callback for lock toggle actions.
   * @param callback The function to call on lock toggle.
   */
  setLockCallback(callback: OutlinerLockCallback | null): void {
    this.lockCallback = callback;
  }

  /**
   * Registers the callback for hierarchy drag-and-drop reparent actions.
   * @param callback The function to call when an item is dropped on another.
   */
  setReparentCallback(callback: OutlinerReparentCallback | null): void {
    this.reparentCallback = callback;
  }

  /**
   * Maintains backward compatibility for legacy context callback registration.
   * @param onDuplicate The callback invoked when Duplicate is selected.
   * @param onDelete The callback invoked when Delete is selected.
   */
  setContextCallbacks(
    onDuplicate: OutlinerContextCallback | null,
    onDelete: OutlinerContextCallback | null
  ): void {
    this.duplicateCallback = onDuplicate;
    this.deleteCallback = onDelete;
  }

  /**
   * Refreshes the outliner tree to match the current scene hierarchy.
   * @param _sceneObjects Deprecated parameter, kept for backward compatibility.
   */
  refresh(_sceneObjects?: THREE.Mesh[]): void {
    if (this.isDisposed) return;
    if (this.tree) {
      this.tree.refresh(
        this.selectionManager.getSelectedObjects(),
        this.hierarchySelection
      );
    }
  }

  /**
   * Updates row highlight state without rebuilding the tree.
   */
  private refreshSelectionOnly(): void {
    if (this.isDisposed || !this.tree) return;
    this.tree.updateSelectionStates(
      this.selectionManager.getSelectedObjects(),
      this.hierarchySelection
    );
  }

  /**
   * Disposes the panel and removes it from the DOM.
   */
  dispose(): void {
    this.isDisposed = true;
    if (this.contextMenu) {
      this.contextMenu.dispose();
      this.contextMenu = null;
    }
    if (this.tree) {
      this.tree.dispose();
      this.tree = null;
    }
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  /**
   * Applies styles to the outliner container.
   */
  private applyContainerStyles(): void {
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.overflow = 'hidden';
    this.container.style.background = hexToRgb(Theme.outlinerBackground);
    this.container.style.borderLeft = `2px solid ${hexToRgb(Theme.separatorColor)}`;
    this.container.style.width = '220px';
    this.container.style.minWidth = '220px';
    this.container.style.alignSelf = 'stretch';
    this.container.style.minHeight = '0';
    this.container.style.flexShrink = '0';
    this.container.style.userSelect = 'none';
  }

  /**
   * Instantiates and configures the outliner tree component.
   */
  private createTree(): void {
    this.tree = new OutlinerTree(this.container, this.root);
    this.tree.onSelectObject((obj, event) => this.onSelectObject(obj, event));
    this.tree.onToggleVisibility((obj) => this.onToggleVisibility(obj));
    this.tree.onToggleLock((obj) => this.onToggleLock(obj));
    this.tree.onRenameObject((obj, newName) => this.onRenameFromOutliner(obj, newName));
    this.tree.onContextMenu((obj, x, y) => this.showContextMenu(obj, x, y));
    this.tree.onReparentObject((dragged, target) => this.onReparentFromTree(dragged, target));
  }

  /**
   * Handles object selection from the tree view with multi-select modifiers.
   * Tracks hierarchy nodes (meshes and groups) for grouping, and syncs mesh
   * selection so viewports/gizmos still highlight content meshes.
   * @param obj The Three.js object that was selected.
   * @param event Optional mouse event providing Shift/Ctrl state.
   */
  private onSelectObject(obj: THREE.Object3D, event?: MouseEvent): void {
    if (obj === this.root) return;
    if (event && event.detail > 1) return;
    const additive = event?.shiftKey === true;
    const toggle = event?.ctrlKey === true || event?.metaKey === true;
    this.isApplyingOutlinerSelection = true;
    this.updateHierarchySelection(obj, additive, toggle);
    this.syncMeshSelectionFromHierarchy();
    this.isApplyingOutlinerSelection = false;
    this.refreshSelectionOnly();
  }

  /**
   * Updates hierarchy multi-selection from an outliner row click.
   * @param obj Clicked hierarchy object.
   * @param additive Shift-add mode.
   * @param toggle Ctrl/Meta toggle mode.
   */
  private updateHierarchySelection(
    obj: THREE.Object3D,
    additive: boolean,
    toggle: boolean
  ): void {
    if (toggle) {
      if (this.hierarchySelection.has(obj)) {
        this.hierarchySelection.delete(obj);
      } else {
        this.hierarchySelection.add(obj);
      }
      return;
    }
    if (additive) {
      this.hierarchySelection.add(obj);
      return;
    }
    this.hierarchySelection.clear();
    this.hierarchySelection.add(obj);
  }

  /**
   * Pushes mesh selection derived from hierarchy selection into SelectionManager.
   */
  private syncMeshSelectionFromHierarchy(): void {
    const meshes: THREE.Mesh[] = [];
    this.hierarchySelection.forEach((object) => {
      collectMeshesUnder(object).forEach((mesh) => {
        if (mesh.userData.isSolidModelResult === true) return;
        if (!meshes.includes(mesh)) meshes.push(mesh);
      });
    });
    this.selectionManager.setSelection(meshes);
  }

  /**
   * Keeps hierarchy selection in sync when the viewport changes mesh selection.
   * Updates highlights only so rename/double-click DOM stays intact.
   */
  private onMeshSelectionChanged(): void {
    if (this.isDisposed) return;
    if (!this.isApplyingOutlinerSelection) {
      this.hierarchySelection = new Set(
        this.selectionManager.getAllSelectedObjectsAsArray()
      );
    }
    this.refreshSelectionOnly();
  }

  /**
   * Forwards hierarchy reparent requests to the registered callback.
   * @param dragged The object being dragged.
   * @param dropTarget The drop target object.
   */
  private onReparentFromTree(
    dragged: THREE.Object3D,
    dropTarget: THREE.Object3D
  ): void {
    if (this.reparentCallback) {
      this.reparentCallback(dragged, dropTarget);
    }
  }

  /**
    * Handles rename from the tree view inline editor.
    * @param obj The object to rename.
    * @param newName The new name to assign.
    */
  private onRenameFromOutliner(obj: THREE.Object3D, newName: string): void {
    if (this.renameCallback) {
      this.renameCallback(obj, newName);
    }
  }

  /**
    * Handles visibility toggle from the tree view.
    * @param obj The object whose visibility should toggle.
    */
  private onToggleVisibility(obj: THREE.Object3D): void {
    if (this.visibilityCallback) {
      this.visibilityCallback(obj);
    } else {
      obj.visible = !obj.visible;
    }
  }

  /**
   * Handles lock toggle from the tree view.
   * @param obj The object whose lock state should toggle.
   */
  private onToggleLock(obj: THREE.Object3D): void {
    if (this.lockCallback) {
      this.lockCallback(obj);
    }
  }

  /**
   * Shows the right-click context menu for a specific object.
   * @param obj The Three.js object for the context menu.
   * @param x The horizontal screen coordinate.
   * @param y The vertical screen coordinate.
   */
  private showContextMenu(obj: THREE.Object3D, x: number, y: number): void {
    if (!this.hierarchySelection.has(obj)) {
      this.isApplyingOutlinerSelection = true;
      this.hierarchySelection.clear();
      this.hierarchySelection.add(obj);
      this.syncMeshSelectionFromHierarchy();
      this.isApplyingOutlinerSelection = false;
      this.refresh();
    }
    const menuItems: ContextMenuItem[] = this.buildContextItems(obj);
    if (this.contextMenu) {
      this.contextMenu.dispose();
    }
    this.contextMenu = new ContextMenu(this.container, menuItems);
    this.contextMenu.show(x, y);
  }

  /**
    * Builds the array of context menu items for an object.
    * @param obj The object for which to build menu items.
    * @returns An array of context menu item configurations.
    */
  private buildContextItems(obj: THREE.Object3D): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    items.push(...this.buildEditMenuItems(obj));
    items.push(this.buildSeparatorItem());
    items.push(...this.buildGroupMenuItems(obj));
    items.push(this.buildSeparatorItem());
    items.push(this.buildVisibilityMenuItem(obj));
    return items;
  }

  /**
    * Builds the edit section of context menu items.
    * @param obj The object for which to build edit menu items.
    * @returns An array of edit-related menu items.
    */
  private buildEditMenuItems(obj: THREE.Object3D): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    if (this.duplicateCallback) {
      items.push({
        label: 'Duplicate',
        callback: () => this.duplicateCallback(obj)
      });
    }
    if (this.deleteCallback) {
      items.push({
        label: 'Delete',
        callback: () => this.deleteCallback(obj)
      });
    }
    return items;
  }

  /**
    * Builds the grouping section of context menu items.
    * @param obj The object for which to build group menu items.
    * @returns An array of group-related menu items.
    */
  private buildGroupMenuItems(obj: THREE.Object3D): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    if (this.groupCallback) {
      items.push({
        label: 'Group',
        callback: () => this.onGroup(obj)
      });
    }
    if (this.ungroupCallback && obj instanceof THREE.Group) {
      items.push({
        label: 'Ungroup',
        callback: () => this.ungroupCallback(obj)
      });
    }
    return items;
  }

  /**
    * Builds the visibility toggle menu item.
    * @param obj The object for which to build the visibility menu item.
    * @returns The visibility toggle menu item configuration.
    */
  private buildVisibilityMenuItem(obj: THREE.Object3D): ContextMenuItem {
    return {
      label: 'Toggle Visibility',
      callback: () => this.onToggleVisibility(obj)
    };
  }

  /**
    * Builds a separator menu item for the context menu.
    * @returns A separator menu item configuration.
    */
  private buildSeparatorItem(): ContextMenuItem {
    return {
      label: '---',
      callback: () => {}
    };
  }

  /**
   * Handles the group action from the context menu.
   * @param obj The object to include in the new group.
   */
  private onGroup(obj: THREE.Object3D): void {
    if (!this.groupCallback) return;
    if (this.hierarchySelection.size === 0) {
      this.hierarchySelection.add(obj);
    }
    this.groupCallback(this.getObjectsForGrouping());
  }
}
