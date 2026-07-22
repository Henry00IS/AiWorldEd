import * as THREE from 'three';
import { Theme } from '../theme.js';

/**
 * UserData flag marking a LineSegments object as a selection outline.
 * Used to exclude outlines from viewport clones and raycast targets.
 */
export const SELECTION_HIGHLIGHT_USERDATA_KEY = 'isSelectionHighlight';

/**
 * Visual orange edge outlines on selected objects.
 * Outlines are parented to their meshes so they follow transforms in real time.
 * Never reparents scene objects — only attaches outline children to meshes
 * that already live in this highlight's scene graph.
 */
export class SelectionHighlight {
  private scene: THREE.Scene;
  private highlightMap: Map<THREE.Mesh, THREE.LineSegments>;
  private highlightColor: number;
  private lineMaterial: THREE.LineBasicMaterial;

  /**
   * Creates a new selection highlight manager for the given scene.
   * @param scene The Three.js scene this highlight instance belongs to.
   * @param theme The theme color constants used for highlight appearance.
   */
  constructor(scene: THREE.Scene, theme: typeof Theme) {
    this.scene = scene;
    this.highlightMap = new Map();
    this.highlightColor = theme.selectionColor;
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: this.highlightColor,
      linewidth: 2,
      depthTest: false
    });
  }

  /**
   * Applies an orange edge outline to a mesh if it belongs to this scene.
   * @param mesh The mesh to highlight.
   */
  apply(mesh: THREE.Mesh): void {
    if (this.highlightMap.has(mesh)) return;
    if (!this.isDescendantOfScene(mesh)) return;
    if (!mesh.geometry) return;
    this.stripOrphanHighlights(mesh);
    const lineSegments = this.createOutlineForMesh(mesh);
    mesh.add(lineSegments);
    this.highlightMap.set(mesh, lineSegments);
  }

  /**
   * Removes the orange edge outline from a mesh.
   * @param mesh The mesh to un-highlight.
   */
  remove(mesh: THREE.Mesh): void {
    const lineSegments = this.highlightMap.get(mesh);
    if (!lineSegments) return;
    this.disposeLineSegments(mesh, lineSegments);
    this.highlightMap.delete(mesh);
  }

  /**
   * Removes all active highlights from the scene.
   */
  clearAll(): void {
    const meshes = Array.from(this.highlightMap.keys());
    meshes.forEach((mesh) => this.remove(mesh));
  }

  /**
   * Forces every active outline to match its parent mesh transform.
   * Outlines are mesh children so this is normally automatic; calling this
   * after external transform updates keeps multi-viewport clones consistent.
   */
  syncTransforms(): void {
    this.highlightMap.forEach((lineSegments, mesh) => {
      if (lineSegments.parent !== mesh) {
        mesh.add(lineSegments);
      }
      lineSegments.position.set(0, 0, 0);
      lineSegments.rotation.set(0, 0, 0);
      lineSegments.scale.set(1, 1, 1);
      lineSegments.updateMatrix();
    });
  }

  /**
   * Rebuilds outline geometry for all highlighted meshes.
   * Call after geometry edits so edges match the current mesh.
   */
  rebuildGeometries(): void {
    const meshes = Array.from(this.highlightMap.keys());
    meshes.forEach((mesh) => {
      this.remove(mesh);
      this.apply(mesh);
    });
  }

  /**
   * Updates the highlight color for all active highlights.
   * @param color The new hex color value for highlights.
   */
  updateColor(color: number): void {
    this.highlightColor = color;
    this.highlightMap.forEach((lineSegments) => {
      const lineMaterial = lineSegments.material as THREE.LineBasicMaterial;
      lineMaterial.color.setHex(color);
    });
  }

  /**
   * Disposes all highlight resources and clears state.
   */
  dispose(): void {
    this.clearAll();
    this.lineMaterial.dispose();
  }

  /**
   * Returns the set of meshes currently highlighted.
   * @returns A set of highlighted mesh references.
   */
  getHighlightedMeshes(): Set<THREE.Mesh> {
    return new Set(this.highlightMap.keys());
  }

  /**
   * Creates outline LineSegments for a mesh in local space.
   * @param mesh The mesh whose edges will be outlined.
   * @returns Configured LineSegments ready to parent under the mesh.
   */
  private createOutlineForMesh(mesh: THREE.Mesh): THREE.LineSegments {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const lineSegments = new THREE.LineSegments(edges, this.lineMaterial.clone());
    const material = lineSegments.material as THREE.LineBasicMaterial;
    material.color.setHex(this.highlightColor);
    lineSegments.renderOrder = 998;
    lineSegments.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    lineSegments.matrixAutoUpdate = true;
    return lineSegments;
  }

  /**
   * Removes any orphaned outline children left behind by cloning.
   * @param mesh The mesh to clean.
   */
  private stripOrphanHighlights(mesh: THREE.Mesh): void {
    const orphans = mesh.children.filter(
      (child) =>
        child instanceof THREE.LineSegments &&
        child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true
    );
    orphans.forEach((child) => {
      this.disposeLineSegments(mesh, child as THREE.LineSegments);
    });
  }

  /**
   * Detaches and disposes a LineSegments outline.
   * @param mesh The parent mesh.
   * @param lineSegments The outline to dispose.
   */
  private disposeLineSegments(
    mesh: THREE.Mesh,
    lineSegments: THREE.LineSegments
  ): void {
    mesh.remove(lineSegments);
    lineSegments.geometry.dispose();
    const lineMaterial = lineSegments.material as THREE.LineBasicMaterial;
    lineMaterial.dispose();
  }

  /**
   * Checks whether a mesh is part of this highlight's scene graph.
   * @param mesh The mesh to test.
   * @returns True if the mesh is the scene or a descendant of it.
   */
  private isDescendantOfScene(mesh: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (current === this.scene) return true;
      current = current.parent;
    }
    return false;
  }
}
