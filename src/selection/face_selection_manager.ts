import * as THREE from 'three';
import {
  computeTriangleNormal,
  findCoplanarFaceIndices
} from './triangle_geometry_utils.js';

/**
 * A single face selection entry referencing a mesh and a face index.
 */
export interface FaceSelection {
  mesh: THREE.Mesh;
  faceIndex: number;
}

/**
 * Callback invoked when the face selection set changes.
 * @param selected The current set of face selections.
 */
export type FaceSelectionChangedCallback = (selected: FaceSelection[]) => void;

/**
 * Manages selection of polygonal faces on meshes.
 * A click expands to all coplanar triangles so whole box sides select as one face.
 */
export class FaceSelectionManager {
  private selectedFaces: FaceSelection[];
  private changeCallback: FaceSelectionChangedCallback | null;

  /**
   * Creates a new face selection manager with an empty selection.
   */
  constructor() {
    this.selectedFaces = [];
    this.changeCallback = null;
  }

  /**
   * Selects a face on a mesh. Expands to coplanar triangles by default.
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index of the face to select.
   * @param addToSelection Whether to add to existing selection or replace it.
   * @param expandCoplanar When true, selects the whole coplanar polygon face.
   */
  selectFace(
    mesh: THREE.Mesh,
    faceIndex: number,
    addToSelection: boolean,
    expandCoplanar: boolean = true
  ): void {
    if (!addToSelection) {
      this.selectedFaces = [];
    }
    const faceIndices = expandCoplanar
      ? findCoplanarFaceIndices(mesh.geometry, faceIndex)
      : [faceIndex];
    let changed = false;
    faceIndices.forEach((index) => {
      if (this.isFaceSelected(mesh, index)) return;
      this.selectedFaces.push({ mesh, faceIndex: index });
      changed = true;
    });
    if (changed) {
      this.notifyChange();
    }
  }

  /**
   * Clears all selected faces.
   */
  deselectAll(): void {
    if (this.selectedFaces.length === 0) return;
    this.selectedFaces = [];
    this.notifyChange();
  }

  /**
   * Removes a specific face from the selection.
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index of the face to remove.
   */
  removeFace(mesh: THREE.Mesh, faceIndex: number): void {
    const initialLength = this.selectedFaces.length;
    this.selectedFaces = this.selectedFaces.filter(
      (entry) => !(entry.mesh === mesh && entry.faceIndex === faceIndex)
    );
    if (this.selectedFaces.length !== initialLength) {
      this.notifyChange();
    }
  }

  /**
   * Returns the array of currently selected faces.
   * @returns The array of face selection entries.
   */
  getSelectedFaces(): FaceSelection[] {
    return this.selectedFaces;
  }

  /**
   * Returns the count of currently selected faces.
   * @returns The number of selected faces.
   */
  getSelectedFaceCount(): number {
    return this.selectedFaces.length;
  }

  /**
   * Checks whether a specific face is currently selected.
   * @param mesh The mesh to check.
   * @param faceIndex The face index to check.
   * @returns True if the face is in the selection.
   */
  isFaceSelected(mesh: THREE.Mesh, faceIndex: number): boolean {
    return this.selectedFaces.some(
      (entry) => entry.mesh === mesh && entry.faceIndex === faceIndex
    );
  }

  /**
   * Computes the average normal vector across all selected faces.
   * Returns a zero vector if no faces are selected.
   * @returns The average normal direction as a Vector3.
   */
  computeAverageNormal(): THREE.Vector3 {
    const normalAccumulator = new THREE.Vector3();
    this.selectedFaces.forEach((entry) => {
      normalAccumulator.add(computeTriangleNormal(entry.mesh.geometry, entry.faceIndex));
    });
    if (this.selectedFaces.length > 0) {
      normalAccumulator.divideScalar(this.selectedFaces.length);
    }
    return normalAccumulator.normalize();
  }

  /**
   * Registers a callback to be invoked on face selection changes.
   * @param callback The function to call when selection changes.
   */
  setSelectionChangedCallback(callback: FaceSelectionChangedCallback): void {
    this.changeCallback = callback;
  }

  /**
   * Clears all state and callbacks.
   */
  clear(): void {
    this.selectedFaces = [];
    this.changeCallback = null;
  }

  /**
   * Notifies the registered callback of a selection change.
   */
  private notifyChange(): void {
    if (this.changeCallback) {
      this.changeCallback(this.selectedFaces);
    }
  }
}
