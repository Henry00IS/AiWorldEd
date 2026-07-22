import * as THREE from 'three';

/**
 * Callback invoked when the selection set changes.
 * @param selected The current set of selected meshes.
 */
export type SelectionChangedCallback = (selected: Set<THREE.Mesh>) => void;

/**
 * Central selection state manager.
 * Maintains a set of selected meshes and notifies listeners on changes.
 */
export class SelectionManager {
  private selectedObjects: Set<THREE.Mesh>;
  private changeCallbacks: SelectionChangedCallback[];

  /**
   * Creates a new selection manager with an initially empty selection set.
   */
  constructor() {
    this.selectedObjects = new Set();
    this.changeCallbacks = [];
  }

  /**
   * Selects a single object, clearing any previous selection.
   * @param mesh The mesh to select.
   */
  selectObject(mesh: THREE.Mesh): void {
    if (this.selectedObjects.size === 1 && this.selectedObjects.has(mesh)) return;
    this.selectedObjects.clear();
    this.selectedObjects.add(mesh);
    this.notifyChange();
  }

  /**
   * Replaces the selection with the given meshes.
   * Skips notification when the set is already identical (preserves outliner rename).
   * @param meshes The meshes that should become the selection set.
   */
  setSelection(meshes: THREE.Mesh[]): void {
    if (this.isSameSelection(meshes)) return;
    this.selectedObjects.clear();
    meshes.forEach((mesh) => this.selectedObjects.add(mesh));
    this.notifyChange();
  }

  /**
   * Returns whether the given meshes match the current selection set.
   * @param meshes Candidate selection.
   * @returns True when membership is identical.
   */
  private isSameSelection(meshes: THREE.Mesh[]): boolean {
    if (meshes.length !== this.selectedObjects.size) return false;
    return meshes.every((mesh) => this.selectedObjects.has(mesh));
  }

  /**
   * Adds an object to the current selection set.
   * @param mesh The mesh to add to selection.
   */
  addToSelection(mesh: THREE.Mesh): void {
    if (this.selectedObjects.has(mesh)) return;
    this.selectedObjects.add(mesh);
    this.notifyChange();
  }

  /**
   * Toggles a mesh in or out of the multi-selection set.
   * @param mesh The mesh to toggle.
   */
  toggleSelection(mesh: THREE.Mesh): void {
    if (this.selectedObjects.has(mesh)) {
      this.selectedObjects.delete(mesh);
    } else {
      this.selectedObjects.add(mesh);
    }
    this.notifyChange();
  }

  /**
   * Applies a click selection with optional multi-select modifiers.
   * Shift or Ctrl/Meta adds or toggles; plain click replaces selection.
   * @param mesh The mesh that was clicked.
   * @param additive True when Shift is held (add if missing).
   * @param toggle True when Ctrl/Meta is held (toggle membership).
   */
  selectFromClick(mesh: THREE.Mesh, additive: boolean, toggle: boolean): void {
    if (toggle) {
      this.toggleSelection(mesh);
      return;
    }
    if (additive) {
      this.addToSelection(mesh);
      return;
    }
    this.selectObject(mesh);
  }

  /**
   * Removes an object from the current selection set.
   * @param mesh The mesh to deselect.
   */
  removeFromSelection(mesh: THREE.Mesh): void {
    if (!this.selectedObjects.has(mesh)) return;
    this.selectedObjects.delete(mesh);
    this.notifyChange();
  }

  /**
   * Clears all selected objects.
   */
  clearSelection(): void {
    if (this.selectedObjects.size === 0) return;
    this.selectedObjects.clear();
    this.notifyChange();
  }

  /**
   * Drops selected meshes that are no longer under the given scene root.
   * Use after load, delete, undo, or redo so the selection never keeps
   * references to meshes removed from the scene graph.
   * @param sceneRoot The world root objects must remain under.
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
    this.notifyChange();
    return true;
  }

  /**
   * Returns whether an object is the root or a descendant of the root.
   * @param object The object to test.
   * @param root The scene root to search toward.
   * @returns True when object is under root in the parent chain.
   */
  private isDescendantOf(
    object: THREE.Object3D,
    root: THREE.Object3D
  ): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Returns the current set of selected objects.
   * @returns A set containing all selected meshes.
   */
  getSelectedObjects(): Set<THREE.Mesh> {
    return this.selectedObjects;
  }

  /**
   * Returns the count of currently selected objects.
   * @returns The number of selected meshes.
   */
  getSelectedObjectCount(): number {
    return this.selectedObjects.size;
  }

  /**
   * Checks whether a mesh is currently selected.
   * @param mesh The mesh to check.
   * @returns True if the mesh is in the selection set.
   */
  isObjectSelected(mesh: THREE.Mesh): boolean {
    return this.selectedObjects.has(mesh);
  }

  /**
   * Returns the first selected object from the selection set.
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
   * @returns An array containing all selected meshes.
   */
  getAllSelectedObjectsAsArray(): THREE.Mesh[] {
    return Array.from(this.selectedObjects);
  }

  /**
   * Registers a callback to be invoked whenever the selection changes.
   * @param callback The function to call on selection changes.
   */
  onSelectionChanged(callback: SelectionChangedCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Unregisters a previously registered selection change callback.
   * @param callback The function to remove from callbacks.
   */
  offSelectionChanged(callback: SelectionChangedCallback): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  /**
   * Removes all change callbacks and clears selection.
   */
  dispose(): void {
    this.selectedObjects.clear();
    this.changeCallbacks = [];
  }

  /**
   * Notifies all registered callbacks of a selection change.
   */
  private notifyChange(): void {
    this.changeCallbacks.forEach((callback) => {
      callback(this.selectedObjects);
    });
  }
}
