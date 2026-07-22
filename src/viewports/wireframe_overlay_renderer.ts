import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../selection/selection_highlight.js';

/**
 * Renders wireframe overlays on top of the viewport scene.
 * Overlays are parented to their source meshes so they follow transforms
 * during live drag operations without waiting for a full rebuild.
 */
export class WireframeOverlayRenderer {
  private viewportScene: THREE.Scene;
  private overlayEntries: Map<THREE.Mesh, THREE.LineSegments>;
  private lineMaterial: THREE.LineBasicMaterial;
  private overlaysVisible: boolean;

  /**
   * Creates a new wireframe overlay renderer for the given scene.
   * @param viewportScene The Three.js scene that owns the target meshes.
   */
  constructor(viewportScene: THREE.Scene) {
    this.viewportScene = viewportScene;
    this.overlayEntries = new Map();
    this.overlaysVisible = true;
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: Theme.selectionColor,
      transparent: true,
      opacity: 0.85
    });
  }

  /**
   * Builds wireframe overlays for the given meshes.
   * Clears any previously built overlays before creating new ones.
   * @param meshes The meshes to generate wireframe edges for.
   */
  setMeshes(meshes: THREE.Mesh[]): void {
    this.clearOverlays();
    meshes.forEach((mesh) => this.addMeshOverlay(mesh));
  }

  /**
   * Re-syncs overlay local transforms so they stay glued to their meshes.
   * Safe to call every frame or during live transform drags.
   */
  syncTransforms(): void {
    this.overlayEntries.forEach((lineSegments, mesh) => {
      if (lineSegments.parent !== mesh) {
        mesh.add(lineSegments);
      }
      lineSegments.position.set(0, 0, 0);
      lineSegments.rotation.set(0, 0, 0);
      lineSegments.scale.set(1, 1, 1);
      lineSegments.visible = this.overlaysVisible;
    });
  }

  /**
   * Removes all overlay LineSegments from their parent meshes.
   */
  private clearOverlays(): void {
    this.overlayEntries.forEach((lineSegments, mesh) => {
      mesh.remove(lineSegments);
      lineSegments.geometry.dispose();
    });
    this.overlayEntries.clear();
  }

  /**
   * Creates a LineSegments overlay parented under a single mesh.
   * @param mesh The source mesh to generate edges from.
   */
  private addMeshOverlay(mesh: THREE.Mesh): void {
    if (!mesh.geometry) return;
    if (mesh.userData[SELECTION_HIGHLIGHT_USERDATA_KEY]) return;
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
    const lineSegments = new THREE.LineSegments(edgesGeometry, this.lineMaterial);
    lineSegments.userData.isWireframeOverlay = true;
    lineSegments.renderOrder = 997;
    lineSegments.visible = this.overlaysVisible;
    mesh.add(lineSegments);
    this.overlayEntries.set(mesh, lineSegments);
  }

  /**
   * Shows or hides all wireframe overlays.
   * @param visible Whether the overlays should be visible.
   */
  setVisible(visible: boolean): void {
    this.overlaysVisible = visible;
    this.overlayEntries.forEach((lineSegments) => {
      lineSegments.visible = visible;
    });
  }

  /**
   * Returns whether overlays are currently set to visible.
   * @returns True if overlays should be shown.
   */
  isVisible(): boolean {
    return this.overlaysVisible;
  }

  /**
   * Removes overlays from meshes and disposes all resources.
   */
  dispose(): void {
    this.clearOverlays();
    this.lineMaterial.dispose();
  }

  /**
   * Returns the number of active overlay entries (for tests).
   * @returns Overlay count.
   */
  getOverlayCount(): number {
    return this.overlayEntries.size;
  }

  /**
   * Returns the overlay for a mesh when present (for tests).
   * @param mesh The mesh to look up.
   * @returns The overlay LineSegments, or undefined.
   */
  getOverlayForMesh(mesh: THREE.Mesh): THREE.LineSegments | undefined {
    return this.overlayEntries.get(mesh);
  }
}
