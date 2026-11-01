import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { MenuContext, MenuContextItem } from '@/ui/menu/menu_context.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { OutlinerTree } from './outliner_tree.js';
import type { OutlinerDropPlacement } from './outliner_drop_placement.js';
import { collectMeshesUnder } from '@/utils/utils_hierarchy.js';
import { collapseToHierarchyRoots } from '@/utils/hierarchy_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { OutlinerRemoteHolderResolver } from '@/outliner/ui/outliner_item.js';

/**
 * Callback type for context menu actions on outliner items.
 *
 * @param obj The Three.js object associated with the context menu action.
 */
export type OutlinerContextCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for group action from context menu.
 *
 * @param objects The objects to group together.
 */
export type OutlinerGroupCallback = (objects: THREE.Object3D[]) => void;

/**
 * Callback type for ungroup action from context menu.
 *
 * @param group The group object to ungroup.
 */
export type OutlinerUngroupCallback = (group: THREE.Group) => void;

/**
 * Callback type for rename action from context menu.
 *
 * @param obj The object to rename.
 * @param newName The new name to assign.
 */
export type OutlinerRenameCallback = (obj: THREE.Object3D, newName: string) => void;

/**
 * Callback type for visibility toggle from context menu.
 *
 * @param obj The object whose visibility should toggle.
 */
export type OutlinerVisibilityCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for lock toggle from the outliner tree.
 *
 * @param obj The object whose lock state should toggle.
 */
export type OutlinerLockCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for hierarchy reparent via drag-and-drop.
 *
 * @param dragged Objects being moved (multi-select expands to the full set).
 * @param dropTarget The object that received the drop.
 * @param placement Vertical drop placement relative to the target row.
 */
export type OutlinerReparentCallback = (
  dragged: readonly THREE.Object3D[],
  dropTarget: THREE.Object3D,
  placement: OutlinerDropPlacement,
) => void;

/**
 * Face-mode outliner pick handler. When it returns true, the outliner does not
 * object-select; Shift adds and Ctrl removes faces (same as viewport face
 * paint).
 *
 * @param hierarchyObject Clicked outliner object.
 * @param isShiftPressed Additive when true.
 * @param isCtrlPressed Subtractive when true.
 * @returns True when face mode consumed the pick.
 */
export type OutlinerFaceModeSelectionHandler = (
  hierarchyObject: THREE.Object3D,
  isShiftPressed: boolean,
  isCtrlPressed: boolean,
) => boolean;

/**
 * Guard that blocks object selection changes from the outliner (e.g. Edit
 * Mode).
 *
 * @returns True when object selection must not change.
 */
export type OutlinerObjectSelectionLockGuard = () => boolean;

/**
 * Admits an outliner edit of one object. In a collaboration room it selects the
 * object and takes its lock before applying, and refuses objects that another
 * member holds; null outside rooms, where edits apply directly.
 *
 * @param object Object the edit changes.
 * @param select Selects the object's row; returns false when refused.
 * @param apply Applies the edit.
 * @param refused Called instead of apply when the edit is refused.
 */
export type OutlinerEditGate = (
  object: THREE.Object3D,
  select: () => boolean,
  apply: () => void,
  refused: () => void,
) => void;

/**
 * Admits a drag-and-drop move inside a collaboration room: refuses moves into a
 * container another member edits, otherwise selects the moved rows, takes their
 * locks and only then applies the move; null outside rooms.
 *
 * @param objects Objects being moved.
 * @param container Object that becomes their parent.
 * @param select Selects the moved rows; returns false when refused.
 * @param apply Applies the move.
 * @param refused Called instead of apply when the move is refused.
 */
export type OutlinerMoveGate = (
  objects: readonly THREE.Object3D[],
  container: THREE.Object3D,
  select: () => boolean,
  apply: () => void,
  refused: () => void,
) => void;

/**
 * Hierarchical scene object panel with tree rendering. Displays scene objects
 * as a collapsible tree with type icons, visibility toggles, inline rename, and
 * context menu support.
 */
export class PanelOutliner {
  private container: HTMLElement;
  private selectionManager: ManagerSelection;
  private root: THREE.Object3D;
  private isDisposed: boolean;
  private MenuContext: MenuContext | null;
  private tree: OutlinerTree | null;
  private duplicateCallback: OutlinerContextCallback | null;
  private deleteCallback: OutlinerContextCallback | null;
  private groupCallback: OutlinerGroupCallback | null;
  private ungroupCallback: OutlinerUngroupCallback | null;
  private renameCallback: OutlinerRenameCallback | null;
  private visibilityCallback: OutlinerVisibilityCallback | null;
  private lockCallback: OutlinerLockCallback | null;
  private reparentCallback: OutlinerReparentCallback | null;
  private faceModeSelectionHandler: OutlinerFaceModeSelectionHandler | null;
  private hierarchySelection: Set<THREE.Object3D>;
  private isApplyingOutlinerSelection: boolean;
  private remoteHolderResolver: OutlinerRemoteHolderResolver | null = null;
  private editGate: OutlinerEditGate | null = null;
  private moveGate: OutlinerMoveGate | null = null;

  /**
   * Creates a new outliner panel bound to a selection manager and scene root.
   *
   * @param container The parent DOM element to append the panel into.
   * @param selectionManager The selection manager for tracking selection state.
   * @param root The root Three.js object representing the scene hierarchy.
   */
  constructor(container: HTMLElement, selectionManager: ManagerSelection, root: THREE.Object3D) {
    this.container = document.createElement('div');
    this.selectionManager = selectionManager;
    this.root = root;
    this.isDisposed = false;
    this.MenuContext = null;
    this.tree = null;
    this.duplicateCallback = null;
    this.deleteCallback = null;
    this.groupCallback = null;
    this.ungroupCallback = null;
    this.renameCallback = null;
    this.visibilityCallback = null;
    this.lockCallback = null;
    this.reparentCallback = null;
    this.faceModeSelectionHandler = null;
    this.hierarchySelection = new Set();
    this.isApplyingOutlinerSelection = false;
    this.applyContainerStyles();
    this.createTree();
    container.appendChild(this.container);
    this.selectionManager.onSelectionChanged(() => this.onMeshSelectionChanged());
  }

  /**
   * Returns hierarchy nodes to group (outermost selected outliner rows). Falls
   * back to mesh selection when hierarchy selection is empty.
   *
   * @returns Objects to pass into CommandObjectGroup.
   */
  getObjectsForGrouping(): THREE.Object3D[] {
    if (this.hierarchySelection.size > 0) {
      return collapseToHierarchyRoots(Array.from(this.hierarchySelection));
    }
    return this.selectionManager.getAllSelectedObjectsAsArray();
  }

  /**
   * Registers the callback for duplicate context menu actions.
   *
   * @param callback The function to call on duplicate.
   */
  setDuplicateCallback(callback: OutlinerContextCallback | null): void {
    this.duplicateCallback = callback;
  }

  /**
   * Registers the callback for delete context menu actions.
   *
   * @param callback The function to call on delete.
   */
  setDeleteCallback(callback: OutlinerContextCallback | null): void {
    this.deleteCallback = callback;
  }

  /**
   * Registers the callback for group context menu actions.
   *
   * @param callback The function to call on group.
   */
  setGroupCallback(callback: OutlinerGroupCallback | null): void {
    this.groupCallback = callback;
  }

  /**
   * Registers the callback for ungroup context menu actions.
   *
   * @param callback The function to call on ungroup.
   */
  setUngroupCallback(callback: OutlinerUngroupCallback | null): void {
    this.ungroupCallback = callback;
  }

  /**
   * Registers the callback for rename actions.
   *
   * @param callback The function to call on rename.
   */
  setRenameCallback(callback: OutlinerRenameCallback | null): void {
    this.renameCallback = callback;
  }

  /**
   * Registers the callback for visibility toggle actions.
   *
   * @param callback The function to call on visibility toggle.
   */
  setVisibilityCallback(callback: OutlinerVisibilityCallback | null): void {
    this.visibilityCallback = callback;
  }

  /**
   * Registers the callback for lock toggle actions.
   *
   * @param callback The function to call on lock toggle.
   */
  setLockCallback(callback: OutlinerLockCallback | null): void {
    this.lockCallback = callback;
  }

  /**
   * Registers the callback for hierarchy drag-and-drop reparent actions.
   *
   * @param callback The function to call when an item is dropped on another.
   */
  setReparentCallback(callback: OutlinerReparentCallback | null): void {
    this.reparentCallback = callback;
  }

  /**
   * Registers the face-mode outliner selection handler. When active and the
   * handler returns true, hierarchy picks become face selection instead of
   * object selection.
   *
   * @param handler Face-mode pick handler, or null to disable.
   */
  setFaceModeSelectionHandler(handler: OutlinerFaceModeSelectionHandler | null): void {
    this.faceModeSelectionHandler = handler;
  }

  /**
   * Registers a lock that prevents object selection changes from outliner row
   * clicks (used while Edit Mode owns the domain selection).
   *
   * @param isLocked Guard returning true when selection must not change.
   * @param onBlocked Optional status callback when a click is blocked.
   */
  setObjectSelectionLockGuard(
    isLocked: OutlinerObjectSelectionLockGuard | null,
    onBlocked: (() => void) | null = null,
  ): void {
    this.selectionManager.setSelectionChangeLockGuard(isLocked, onBlocked);
  }

  /**
   * Maintains backward compatibility for legacy context callback registration.
   *
   * @param onDuplicate The callback invoked when Duplicate is selected.
   * @param onDelete The callback invoked when Delete is selected.
   */
  setContextCallbacks(onDuplicate: OutlinerContextCallback | null, onDelete: OutlinerContextCallback | null): void {
    this.duplicateCallback = onDuplicate;
    this.deleteCallback = onDelete;
  }

  /**
   * Refreshes the outliner tree to match the current scene hierarchy.
   *
   * @param _sceneObjects Deprecated parameter, kept for backward compatibility.
   */
  refresh(_sceneObjects?: THREE.Mesh[]): void {
    if (this.isDisposed) return;
    if (this.tree) {
      this.tree.refresh(this.selectionManager.getSelectedObjects(), this.hierarchySelection);
    }
  }

  /**
   * Copies expand/collapse state from a duplicated source root onto its clone.
   *
   * @param sourceRoot Source hierarchy root.
   * @param cloneRoot Clone hierarchy root with matching content structure.
   */
  copyExpandStateFromSource(sourceRoot: THREE.Object3D, cloneRoot: THREE.Object3D): void {
    if (this.isDisposed || !this.tree) {
      return;
    }
    this.tree.copyExpandStateFromSource(sourceRoot, cloneRoot);
  }

  /**
   * Expands ancestors and scrolls the outliner so a hierarchy object is visible
   * after structural edits such as To First / To Last.
   *
   * @param object Mesh or hierarchy node to reveal.
   */
  revealObject(object: THREE.Object3D): void {
    if (this.isDisposed || !this.tree) {
      return;
    }
    this.tree.revealObject(object, this.selectionManager.getSelectedObjects(), this.hierarchySelection);
  }

  /**
   * Scrolls to the most recently interacted selection (inspector root
   * preferred).
   */
  revealLastSelection(): void {
    this.revealLastSelectionInTree();
  }

  /** Updates row highlight state without rebuilding the tree. */
  private refreshSelectionOnly(): void {
    if (this.isDisposed || !this.tree) return;
    this.tree.updateSelectionStates(this.selectionManager.getSelectedObjects(), this.hierarchySelection);
  }

  /** Disposes the panel and removes it from the DOM. */
  dispose(): void {
    this.isDisposed = true;
    if (this.MenuContext) {
      this.MenuContext.dispose();
      this.MenuContext = null;
    }
    if (this.tree) {
      this.tree.dispose();
      this.tree = null;
    }
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  /** Applies styles to the outliner container. */
  private applyContainerStyles(): void {
    this.container.classList.add('editor-outliner-panel');
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

  /** Instantiates and configures the outliner tree component. */
  private createTree(): void {
    this.tree = new OutlinerTree(this.container, this.root);
    this.tree.onSelectObject((obj, event) => this.onSelectObject(obj, event));
    this.tree.onToggleVisibility((obj) => this.onToggleVisibility(obj));
    this.tree.onToggleLock((obj) => this.onToggleLock(obj));
    this.tree.onRenameObject((obj, newName) => this.onRenameFromOutliner(obj, newName));
    this.tree.onContextMenu((obj, x, y) => this.showContextMenu(obj, x, y));
    this.tree.onReparentObject((dragged, target, placement) => this.onReparentFromTree(dragged, target, placement));
    if (this.remoteHolderResolver !== null) this.tree.remoteHolderResolverSet(this.remoteHolderResolver);
  }

  /**
   * Sets (or refreshes) the collaborator lookup that marks rows held by other
   * users.
   *
   * @param resolver Holder lookup, or null when not in a collaboration room.
   */
  remoteHolderResolverSet(resolver: OutlinerRemoteHolderResolver | null): void {
    this.remoteHolderResolver = resolver;
    if (!this.isDisposed && this.tree) this.tree.remoteHolderResolverSet(resolver);
  }

  /**
   * Sets the gate that admits rename, visibility, lock and context-menu edits.
   *
   * @param gate Edit gate, or null to apply edits directly.
   */
  editGateSet(gate: OutlinerEditGate | null): void {
    this.editGate = gate;
  }

  /**
   * Sets the gate that admits drag-and-drop moves.
   *
   * @param gate Move gate, or null to apply moves directly.
   */
  moveGateSet(gate: OutlinerMoveGate | null): void {
    this.moveGate = gate;
  }

  /**
   * Runs an edit of one row through the edit gate.
   *
   * @param obj Object the edit changes.
   * @param apply Applies the edit.
   */
  private gated(obj: THREE.Object3D, apply: () => void): void {
    if (this.editGate === null) {
      apply();
      return;
    }
    this.editGate(
      obj,
      () => this.selectRow(obj),
      apply,
      () => this.refresh(),
    );
  }

  /**
   * Selects a row for an edit unless it already is part of the selection.
   *
   * @param obj Row object.
   * @returns True when the row is selected.
   */
  private selectRow(obj: THREE.Object3D): boolean {
    if (this.hierarchySelection.has(obj)) return true;
    this.onSelectObject(obj);
    return this.hierarchySelection.has(obj) && this.selectionManager.getInspectorObjects().includes(obj);
  }

  /**
   * Handles object selection from the tree view with multi-select modifiers.
   * Tracks hierarchy nodes (meshes and groups) for grouping, and syncs mesh
   * selection so viewports/gizmos still highlight content meshes. In face mode,
   * picks become face selection (Shift add / Ctrl remove) without object bind.
   *
   * @param obj The Three.js object that was selected.
   * @param event Optional mouse event providing Shift/Ctrl state.
   */
  private onSelectObject(obj: THREE.Object3D, event?: MouseEvent): void {
    if (obj === this.root) return;
    if (event && event.detail > 1) return;
    const isShiftPressed = event?.shiftKey === true;
    const isCtrlPressed = event?.ctrlKey === true || event?.metaKey === true;
    if (this.tryApplyFaceModeSelection(obj, isShiftPressed, isCtrlPressed)) {
      return;
    }
    if (this.tryBlockObjectSelectionWhileLocked(obj)) {
      return;
    }
    const previous = new Set(this.hierarchySelection);
    this.isApplyingOutlinerSelection = true;
    this.updateHierarchySelection(obj, isShiftPressed, isCtrlPressed);
    if (!this.syncMeshSelectionFromHierarchy()) this.hierarchySelection = previous;
    this.isApplyingOutlinerSelection = false;
    this.refreshSelectionOnly();
  }

  /**
   * Blocks object selection changes while ManagerSelection is locked (Edit
   * Mode), unless the click only re-targets an already selected hierarchy row
   * without modifiers.
   *
   * @param obj Clicked hierarchy object.
   * @returns True when the pick was blocked.
   */
  private tryBlockObjectSelectionWhileLocked(obj: THREE.Object3D): boolean {
    if (!this.selectionManager.isSelectionChangeLocked()) {
      return false;
    }
    if (this.hierarchySelection.size === 1 && this.hierarchySelection.has(obj)) {
      return true;
    }
    this.selectionManager.notifySelectionChangeBlocked();
    return true;
  }

  /**
   * Applies face-mode outliner selection when a handler is registered and
   * consumes the pick. Keeps object selection empty so the inspector cannot
   * move meshes under a floating face highlight.
   *
   * @param obj Clicked hierarchy object.
   * @param isShiftPressed Additive when true.
   * @param isCtrlPressed Subtractive when true.
   * @returns True when face mode handled the pick.
   */
  private tryApplyFaceModeSelection(obj: THREE.Object3D, isShiftPressed: boolean, isCtrlPressed: boolean): boolean {
    if (!this.faceModeSelectionHandler) {
      return false;
    }
    if (!this.faceModeSelectionHandler(obj, isShiftPressed, isCtrlPressed)) {
      return false;
    }
    this.isApplyingOutlinerSelection = true;
    this.updateHierarchySelectionForFaceMode(obj, isShiftPressed, isCtrlPressed);
    this.selectionManager.clearSelection();
    this.isApplyingOutlinerSelection = false;
    this.refreshSelectionOnly();
    return true;
  }

  /**
   * Updates outliner hierarchy highlight for face-mode picks. Plain replaces,
   * Shift adds the row, Ctrl removes the row.
   *
   * @param obj Clicked hierarchy object.
   * @param isShiftPressed Additive when true.
   * @param isCtrlPressed Subtractive when true.
   */
  private updateHierarchySelectionForFaceMode(
    obj: THREE.Object3D,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
  ): void {
    if (isCtrlPressed) {
      this.hierarchySelection.delete(obj);
      return;
    }
    if (isShiftPressed) {
      this.hierarchySelection.add(obj);
      return;
    }
    this.hierarchySelection.clear();
    this.hierarchySelection.add(obj);
  }

  /**
   * Updates hierarchy multi-selection from an outliner row click.
   *
   * @param obj Clicked hierarchy object.
   * @param additive Shift-add mode.
   * @param toggle Ctrl/Meta toggle mode.
   */
  private updateHierarchySelection(obj: THREE.Object3D, additive: boolean, toggle: boolean): void {
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
   * Pushes mesh selection derived from hierarchy selection into
   * SelectionManager. Solid model roots select their result mesh only (not
   * every brush) so the solid can be transformed as a unit; inspector objects
   * keep the hierarchy root.
   *
   * @returns False when the selection manager refused the change (Edit Mode
   *   lock or a collaborator holding one of the objects).
   */
  private syncMeshSelectionFromHierarchy(): boolean {
    const meshes: THREE.Mesh[] = [];
    const inspectorObjects: THREE.Object3D[] = [];
    this.hierarchySelection.forEach((object) => {
      inspectorObjects.push(object);
      if (SolidModel.isSolidModelObject(object)) {
        this.appendSolidModelSelectionProxy(object, meshes);
        return;
      }
      collectMeshesUnder(object).forEach((mesh) => {
        if (SolidModel.isResultMesh(mesh)) return;
        if (!meshes.includes(mesh)) meshes.push(mesh);
      });
    });
    return this.selectionManager.setSelection(meshes, inspectorObjects);
  }

  /**
   * Adds the solid model result mesh as the viewport selection proxy.
   *
   * @param solidRoot Solid model root group.
   * @param meshes Mesh selection accumulator.
   */
  private appendSolidModelSelectionProxy(solidRoot: THREE.Object3D, meshes: THREE.Mesh[]): void {
    const model = SolidModel.fromObject(solidRoot);
    const resultMesh = model?.getResultMesh();
    if (resultMesh && !meshes.includes(resultMesh)) {
      meshes.push(resultMesh);
    }
  }

  /**
   * Keeps hierarchy selection in sync when the viewport or tools change mesh
   * selection. Expands groups and scrolls to the last selected object for
   * viewport picks.
   */
  private onMeshSelectionChanged(): void {
    if (this.isDisposed) return;
    if (!this.isApplyingOutlinerSelection) {
      // Prefer inspector objects so solid result picks highlight the solid root.
      this.hierarchySelection = new Set(this.selectionManager.getInspectorObjects());
      this.revealLastSelectionInTree();
      return;
    }
    this.refreshSelectionOnly();
  }

  /**
   * Expands ancestors of the focus object and scrolls its outliner row into
   * view. Prefers the last inspector object so selecting a closed group (or a
   * group just duplicated) does not expand that group via child brush reveal.
   */
  private revealLastSelectionInTree(): void {
    if (!this.tree) return;
    const focus = this.resolveOutlinerRevealFocusObject();
    if (!focus) {
      this.refreshSelectionOnly();
      return;
    }
    this.tree.revealObject(focus, this.selectionManager.getSelectedObjects(), this.hierarchySelection);
  }

  /**
   * Picks the hierarchy node used for expand-and-scroll after selection
   * changes.
   *
   * @returns Inspector root when present, otherwise the last selected mesh.
   */
  private resolveOutlinerRevealFocusObject(): THREE.Object3D | null {
    const inspectorObjects = this.selectionManager.getInspectorObjects();
    if (inspectorObjects.length > 0) {
      return inspectorObjects[inspectorObjects.length - 1] ?? null;
    }
    return this.selectionManager.getLastSelectedObject();
  }

  /**
   * Forwards hierarchy reparent requests to the registered callback. When the
   * drag source is multi-selected, every hierarchy-selected root is moved.
   *
   * @param dragged The object being dragged.
   * @param dropTarget The drop target object.
   * @param placement Vertical drop placement relative to the target row.
   */
  private onReparentFromTree(
    dragged: THREE.Object3D,
    dropTarget: THREE.Object3D,
    placement: OutlinerDropPlacement,
  ): void {
    const callback = this.reparentCallback;
    if (!callback) return;
    const objects = this.collectObjectsForReparent(dragged);
    const apply = (): void => callback(objects, dropTarget, placement);
    if (this.moveGate === null) {
      apply();
      return;
    }
    const container = placement === 'into' ? dropTarget : (dropTarget.parent ?? this.root);
    this.moveGate(
      objects,
      container,
      () => objects.every((object) => this.selectRow(object)),
      apply,
      () => this.refresh(),
    );
  }

  /**
   * Builds the set of objects to reparent for a drop. Dragging a selected row
   * moves the whole multi-selection (outermost roots only). Dragging an
   * unselected row moves only that row.
   *
   * @param dragged The row that started the drag.
   * @returns Objects to pass into the reparent handler.
   */
  private collectObjectsForReparent(dragged: THREE.Object3D): THREE.Object3D[] {
    if (!this.hierarchySelection.has(dragged)) {
      return [dragged];
    }
    return collapseToHierarchyRoots(Array.from(this.hierarchySelection));
  }

  /**
   * Handles rename from the tree view inline editor.
   *
   * @param obj The object to rename.
   * @param newName The new name to assign.
   */
  private onRenameFromOutliner(obj: THREE.Object3D, newName: string): void {
    const callback = this.renameCallback;
    if (callback) this.gated(obj, () => callback(obj, newName));
  }

  /**
   * Handles visibility toggle from the tree view.
   *
   * @param obj The object whose visibility should toggle.
   */
  private onToggleVisibility(obj: THREE.Object3D): void {
    const callback = this.visibilityCallback;
    this.gated(obj, () => {
      if (callback) callback(obj);
      else obj.visible = !obj.visible;
    });
  }

  /**
   * Handles lock toggle from the tree view.
   *
   * @param obj The object whose lock state should toggle.
   */
  private onToggleLock(obj: THREE.Object3D): void {
    const callback = this.lockCallback;
    if (callback) this.gated(obj, () => callback(obj));
  }

  /**
   * Shows the right-click context menu for a specific object.
   *
   * @param obj The Three.js object for the context menu.
   * @param x The horizontal screen coordinate.
   * @param y The vertical screen coordinate.
   */
  private showContextMenu(obj: THREE.Object3D, x: number, y: number): void {
    this.gated(obj, () => this.contextMenuOpen(obj, x, y));
  }

  /**
   * Selects the right-clicked row when needed and opens its context menu.
   *
   * @param obj The Three.js object for the context menu.
   * @param x The horizontal screen coordinate.
   * @param y The vertical screen coordinate.
   */
  private contextMenuOpen(obj: THREE.Object3D, x: number, y: number): void {
    if (this.isDisposed) return;
    if (!this.hierarchySelection.has(obj)) {
      this.isApplyingOutlinerSelection = true;
      this.hierarchySelection.clear();
      this.hierarchySelection.add(obj);
      this.syncMeshSelectionFromHierarchy();
      this.isApplyingOutlinerSelection = false;
      this.refresh();
    }
    const menuItems: MenuContextItem[] = this.buildContextItems(obj);
    if (this.MenuContext) {
      this.MenuContext.dispose();
    }
    this.MenuContext = new MenuContext(this.container, menuItems);
    this.MenuContext.show(x, y);
  }

  /**
   * Builds the array of context menu items for an object. Uses the shared menu
   * entry model (actions + real separators) so styling matches File/Edit.
   *
   * @param obj The object for which to build menu items.
   * @returns An array of context menu item configurations.
   */
  private buildContextItems(obj: THREE.Object3D): MenuContextItem[] {
    const items: MenuContextItem[] = [];
    const editItems = this.buildEditMenuItems(obj);
    const groupItems = this.buildGroupMenuItems(obj);
    items.push(...editItems);
    if (editItems.length > 0 && groupItems.length > 0) {
      items.push(this.buildSeparatorItem());
    }
    items.push(...groupItems);
    if (items.length > 0) {
      items.push(this.buildSeparatorItem());
    }
    items.push(this.buildVisibilityMenuItem(obj));
    return items;
  }

  /**
   * Builds the edit section of context menu items.
   *
   * @param obj The object for which to build edit menu items.
   * @returns An array of edit-related menu items.
   */
  private buildEditMenuItems(obj: THREE.Object3D): MenuContextItem[] {
    const items: MenuContextItem[] = [];
    const duplicateCallback = this.duplicateCallback;
    if (duplicateCallback) {
      items.push({
        kind: 'action',
        label: 'Duplicate',
        callback: () => duplicateCallback(obj),
      });
    }
    const deleteCallback = this.deleteCallback;
    if (deleteCallback) {
      items.push({
        kind: 'action',
        label: 'Delete',
        callback: () => deleteCallback(obj),
      });
    }
    return items;
  }

  /**
   * Builds the grouping section of context menu items.
   *
   * @param obj The object for which to build group menu items.
   * @returns An array of group-related menu items.
   */
  private buildGroupMenuItems(obj: THREE.Object3D): MenuContextItem[] {
    const items: MenuContextItem[] = [];
    if (this.groupCallback) {
      items.push({
        kind: 'action',
        label: 'Group',
        callback: () => this.onGroup(obj),
      });
    }
    const ungroupCallback = this.ungroupCallback;
    if (ungroupCallback && obj instanceof THREE.Group) {
      items.push({
        kind: 'action',
        label: 'Ungroup',
        callback: () => ungroupCallback(obj),
      });
    }
    return items;
  }

  /**
   * Builds the visibility toggle menu item.
   *
   * @param obj The object for which to build the visibility menu item.
   * @returns The visibility toggle menu item configuration.
   */
  private buildVisibilityMenuItem(obj: THREE.Object3D): MenuContextItem {
    return {
      kind: 'action',
      label: 'Toggle Visibility',
      callback: () => this.onToggleVisibility(obj),
    };
  }

  /**
   * Builds a styled separator for the shared menu panel.
   *
   * @returns A separator menu item configuration.
   */
  private buildSeparatorItem(): MenuContextItem {
    return { kind: 'separator' };
  }

  /**
   * Handles the group action from the context menu.
   *
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
