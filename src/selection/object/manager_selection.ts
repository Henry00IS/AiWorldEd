import * as THREE from 'three';
import { resolveInspectorObjects } from './resolve_transform_targets.js';

/**
 * Callback invoked when the selection set changes.
 *
 * @param selected The current set of selected meshes.
 */
export type SelectionChangedCallback = (selected: Set<THREE.Mesh>) => void;

/** Guard that reports whether selection mutations must be refused. */
export type SelectionChangeLockGuard = () => boolean;

/**
 * Maintains a set of selected meshes, optional preferred hierarchy objects, and
 * notifies registered callbacks when that selection state changes. When a lock
 * guard is installed and reports locked, selection mutations are refused
 * without changing state.
 */
export class ManagerSelection {
  private selectedObjects: Set<THREE.Mesh>;
  private changeCallbacks: SelectionChangedCallback[];
  /**
   * Most recently selected mesh that was added or chosen by a selection
   * mutation.
   */
  private lastSelectedMesh: THREE.Mesh | null;
  /**
   * Preferred hierarchy objects associated with the current selection when they
   * differ from the selected meshes themselves.
   */
  private inspectorObjects: THREE.Object3D[];
  private selectionChangeLockGuard: SelectionChangeLockGuard | null;
  private selectionChangeBlockedCallback: (() => void) | null;

  /** Creates a new selection manager with an initially empty selection set. */
  constructor() {
    this.selectedObjects = new Set();
    this.changeCallbacks = [];
    this.lastSelectedMesh = null;
    this.inspectorObjects = [];
    this.selectionChangeLockGuard = null;
    this.selectionChangeBlockedCallback = null;
  }

  /**
   * Installs a selection-change lock. When the guard returns true, all user
   * selection mutations return false without changing state.
   *
   * @param isLocked Guard that reports lock state, or null to clear.
   * @param onBlocked Optional callback when a mutation is refused.
   */
  setSelectionChangeLockGuard(isLocked: SelectionChangeLockGuard | null, onBlocked: (() => void) | null = null): void {
    this.selectionChangeLockGuard = isLocked;
    this.selectionChangeBlockedCallback = onBlocked;
  }

  /**
   * Returns whether selection mutations are currently locked.
   *
   * @returns True when the lock guard refuses changes.
   */
  isSelectionChangeLocked(): boolean {
    return this.selectionChangeLockGuard?.() === true;
  }

  /** Invokes the installed blocked callback, if any. */
  notifySelectionChangeBlocked(): void {
    this.selectionChangeBlockedCallback?.();
  }

  /**
   * Selects a single object, clearing any previous selection.
   *
   * @param mesh The mesh to select.
   * @returns True when applied or already selected; false when locked.
   */
  selectObject(mesh: THREE.Mesh): boolean {
    const nextInspector = resolveInspectorObjects([mesh]);
    if (
      this.selectedObjects.size === 1 &&
      this.selectedObjects.has(mesh) &&
      this.isSameInspectorObjects(nextInspector)
    ) {
      return true;
    }
    if (!this.tryAllowSelectionChange()) {
      return false;
    }
    this.selectedObjects.clear();
    this.selectedObjects.add(mesh);
    this.lastSelectedMesh = mesh;
    this.inspectorObjects = nextInspector;
    this.notifyChange();
    return true;
  }

  /**
   * Replaces the selection with the given meshes and optional preferred
   * hierarchy objects. When the meshes and inspector objects already match the
   * current state, returns true without notifying callbacks.
   *
   * @param meshes The meshes that should become the selection set.
   * @param inspectorObjects Optional preferred hierarchy objects; when omitted,
   *   they are derived from meshes.
   * @returns True when applied or already matching; false when locked.
   */
  setSelection(meshes: THREE.Mesh[], inspectorObjects?: THREE.Object3D[]): boolean {
    const nextInspector = inspectorObjects ?? resolveInspectorObjects(meshes);
    if (this.isSameSelection(meshes) && this.isSameInspectorObjects(nextInspector)) {
      return true;
    }
    if (!this.tryAllowSelectionChange()) {
      return false;
    }
    this.selectedObjects.clear();
    meshes.forEach((mesh) => this.selectedObjects.add(mesh));
    this.lastSelectedMesh = meshes[meshes.length - 1] ?? null;
    this.inspectorObjects = nextInspector.slice();
    this.notifyChange();
    return true;
  }

  /**
   * Returns a copy of the preferred hierarchy objects for the current
   * selection, or objects derived from the selected meshes when none are
   * stored.
   *
   * @returns The preferred hierarchy objects for the selection.
   */
  getInspectorObjects(): THREE.Object3D[] {
    if (this.inspectorObjects.length > 0) return this.inspectorObjects.slice();
    return resolveInspectorObjects(Array.from(this.selectedObjects));
  }

  /**
   * Returns whether the given meshes match the current selection set.
   *
   * @param meshes Candidate selection.
   * @returns True when membership is identical.
   */
  private isSameSelection(meshes: THREE.Mesh[]): boolean {
    if (meshes.length !== this.selectedObjects.size) return false;
    return meshes.every((mesh) => this.selectedObjects.has(mesh));
  }

  /**
   * Adds an object to the current selection set.
   *
   * @param mesh The mesh to add to selection.
   * @returns True when applied or already selected; false when locked.
   */
  addToSelection(mesh: THREE.Mesh): boolean {
    if (this.selectedObjects.has(mesh)) {
      return true;
    }
    if (!this.tryAllowSelectionChange()) {
      return false;
    }
    this.selectedObjects.add(mesh);
    this.lastSelectedMesh = mesh;
    this.inspectorObjects = resolveInspectorObjects(Array.from(this.selectedObjects));
    this.notifyChange();
    return true;
  }

  /**
   * Toggles a mesh in or out of the multi-selection set.
   *
   * @param mesh The mesh to toggle.
   * @returns True when applied; false when locked.
   */
  toggleSelection(mesh: THREE.Mesh): boolean {
    if (!this.tryAllowSelectionChange()) {
      return false;
    }
    if (this.selectedObjects.has(mesh)) {
      this.selectedObjects.delete(mesh);
      if (this.lastSelectedMesh === mesh) {
        this.lastSelectedMesh = this.getFirstSelectedObject();
      }
    } else {
      this.selectedObjects.add(mesh);
      this.lastSelectedMesh = mesh;
    }
    this.inspectorObjects = resolveInspectorObjects(Array.from(this.selectedObjects));
    this.notifyChange();
    return true;
  }

  /**
   * Applies a selection change for a single mesh using multi-select flags.
   * Toggle membership when toggle is true; otherwise add when additive is true;
   * otherwise replace the selection with only this mesh.
   *
   * @param mesh The mesh to select, add, or toggle.
   * @param additive True to add the mesh if it is not already selected.
   * @param toggle True to toggle the mesh in or out of the selection set.
   * @returns True when applied or already matching; false when locked.
   */
  selectFromClick(mesh: THREE.Mesh, additive: boolean, toggle: boolean): boolean {
    if (toggle) {
      return this.toggleSelection(mesh);
    }
    if (additive) {
      return this.addToSelection(mesh);
    }
    return this.selectObject(mesh);
  }

  /**
   * Removes an object from the current selection set.
   *
   * @param mesh The mesh to deselect.
   * @returns True when applied or not selected; false when locked.
   */
  removeFromSelection(mesh: THREE.Mesh): boolean {
    if (!this.selectedObjects.has(mesh)) {
      return true;
    }
    if (!this.tryAllowSelectionChange()) {
      return false;
    }
    this.selectedObjects.delete(mesh);
    if (this.lastSelectedMesh === mesh) {
      this.lastSelectedMesh = this.getFirstSelectedObject();
    }
    this.inspectorObjects = resolveInspectorObjects(Array.from(this.selectedObjects));
    this.notifyChange();
    return true;
  }

  /**
   * Clears all selected objects.
   *
   * @returns True when applied or already empty; false when locked.
   */
  clearSelection(): boolean {
    if (this.selectedObjects.size === 0 && this.inspectorObjects.length === 0) {
      return true;
    }
    if (!this.tryAllowSelectionChange()) {
      return false;
    }
    this.selectedObjects.clear();
    this.lastSelectedMesh = null;
    this.inspectorObjects = [];
    this.notifyChange();
    return true;
  }

  /**
   * Removes selected meshes that are not the given root and not descendants of
   * it, updates preferred hierarchy objects, and notifies callbacks. Does not
   * consult the selection lock.
   *
   * @param sceneRoot The root each remaining selected mesh must be under.
   * @returns True when at least one mesh was removed from the selection.
   */
  pruneSelectionNotInScene(sceneRoot: THREE.Object3D): boolean {
    const survivors: THREE.Mesh[] = [];
    let removedAny = false;
    this.selectedObjects.forEach((mesh) => {
      if (this.isDescendantOf(mesh, sceneRoot)) {
        survivors.push(mesh);
      } else {
        removedAny = true;
      }
    });
    if (!removedAny) return false;
    this.selectedObjects.clear();
    survivors.forEach((mesh) => this.selectedObjects.add(mesh));
    if (!this.lastSelectedMesh || !this.selectedObjects.has(this.lastSelectedMesh)) {
      this.lastSelectedMesh = survivors[survivors.length - 1] ?? null;
    }
    this.inspectorObjects = resolveInspectorObjects(survivors);
    this.notifyChange();
    return true;
  }

  /**
   * Returns whether a selection mutation is allowed. Invokes the blocked
   * callback when refused.
   *
   * @returns True when the mutation may proceed.
   */
  private tryAllowSelectionChange(): boolean {
    if (!this.isSelectionChangeLocked()) {
      return true;
    }
    this.notifySelectionChangeBlocked();
    return false;
  }

  /**
   * Returns whether inspector objects match the candidate list.
   *
   * @param objects Candidate inspector objects.
   * @returns True when equal by reference and order length.
   */
  private isSameInspectorObjects(objects: THREE.Object3D[]): boolean {
    if (objects.length !== this.inspectorObjects.length) return false;
    return objects.every((object, index) => object === this.inspectorObjects[index]);
  }

  /**
   * Returns whether an object is the root or a descendant of the root.
   *
   * @param object The object to test.
   * @param root The scene root to search toward.
   * @returns True when object is under root in the parent chain.
   */
  private isDescendantOf(object: THREE.Object3D, root: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Returns the current set of selected objects.
   *
   * @returns A set containing all selected meshes.
   */
  getSelectedObjects(): Set<THREE.Mesh> {
    return this.selectedObjects;
  }

  /**
   * Returns the count of currently selected objects.
   *
   * @returns The number of selected meshes.
   */
  getSelectedObjectCount(): number {
    return this.selectedObjects.size;
  }

  /**
   * Checks whether a mesh is currently selected.
   *
   * @param mesh The mesh to check.
   * @returns True if the mesh is in the selection set.
   */
  isObjectSelected(mesh: THREE.Mesh): boolean {
    return this.selectedObjects.has(mesh);
  }

  /**
   * Returns the first selected object from the selection set.
   *
   * @returns The first selected mesh, or null if the selection is empty.
   */
  getFirstSelectedObject(): THREE.Mesh | null {
    const iterator = this.selectedObjects.values();
    const first = iterator.next();
    if (first.done) return null;
    return first.value;
  }

  /**
   * Returns all selected objects as a standard array.
   *
   * @returns An array containing all selected meshes.
   */
  getAllSelectedObjectsAsArray(): THREE.Mesh[] {
    return Array.from(this.selectedObjects);
  }

  /**
   * Returns the most recently selected mesh when it is still in the selection
   * set; otherwise returns the first selected mesh, or null when empty.
   *
   * @returns The last selected mesh still selected, a fallback first selected
   *   mesh, or null when the selection is empty.
   */
  getLastSelectedObject(): THREE.Mesh | null {
    if (this.lastSelectedMesh && this.selectedObjects.has(this.lastSelectedMesh)) {
      return this.lastSelectedMesh;
    }
    return this.getFirstSelectedObject();
  }

  /**
   * Registers a callback to be invoked whenever the selection changes.
   *
   * @param callback The function to call on selection changes.
   */
  onSelectionChanged(callback: SelectionChangedCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Unregisters a previously registered selection change callback.
   *
   * @param callback The function to remove from callbacks.
   */
  offSelectionChanged(callback: SelectionChangedCallback): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  /** Removes all change callbacks and clears selection (bypasses lock). */
  dispose(): void {
    this.selectedObjects.clear();
    this.inspectorObjects = [];
    this.lastSelectedMesh = null;
    this.changeCallbacks = [];
    this.selectionChangeLockGuard = null;
    this.selectionChangeBlockedCallback = null;
  }

  /** Notifies all registered callbacks of a selection change. */
  private notifyChange(): void {
    this.changeCallbacks.forEach((callback) => {
      callback(this.selectedObjects);
    });
  }
}
