import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { hasEdgeBuildableGeometry } from '@/utils/mesh_edge_sync.js';
import { SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { isEditModeWireframeSuppressed } from '@/utils/edit_mode_wireframe_suppress.js';

/**
 * Renders wireframe overlays on top of the viewport scene. Overlays are
 * parented to their source meshes so they follow transforms during live drag
 * operations without waiting for a full rebuild.
 */
export class RendererWireframeOverlay {
  private overlayEntries: Map<THREE.Mesh, THREE.LineSegments>;
  private overlaySourceGeometry: Map<THREE.Mesh, THREE.BufferGeometry>;
  private lineMaterial: THREE.LineBasicMaterial;
  private overlaysVisible: boolean;

  /**
   * Creates a new wireframe overlay renderer for the given scene.
   *
   * @param _viewportScene The Three.js scene that owns the target meshes.
   */
  constructor(_viewportScene: THREE.Scene) {
    this.overlayEntries = new Map();
    this.overlaySourceGeometry = new Map();
    this.overlaysVisible = true;
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: Theme.selectionColor,
      transparent: true,
      opacity: 0.85,
    });
  }

  /**
   * Ensures wireframe overlays exist for the given meshes. Existing overlays
   * whose source BufferGeometry reference is unchanged are reused so large
   * scene meshes are not re-edged on every material-only refresh.
   *
   * @param meshes The meshes to generate wireframe edges for.
   */
  setMeshes(meshes: THREE.Mesh[]): void {
    const retainedMeshes = new Set<THREE.Mesh>();
    for (const mesh of meshes) {
      if (this.retainOrRebuildOverlay(mesh)) {
        retainedMeshes.add(mesh);
      }
    }
    this.removeOverlaysNotIn(retainedMeshes);
  }

  /**
   * Re-syncs overlay local transforms so they stay glued to their meshes. Safe
   * to call every frame or during live transform drags.
   */
  syncTransforms(): void {
    this.overlayEntries.forEach((lineSegments, mesh) => {
      if (lineSegments.parent !== mesh) {
        mesh.add(lineSegments);
      }
      lineSegments.position.set(0, 0, 0);
      lineSegments.rotation.set(0, 0, 0);
      lineSegments.scale.set(1, 1, 1);
      if (isEditModeWireframeSuppressed(lineSegments)) {
        lineSegments.visible = false;
        return;
      }
      lineSegments.visible = this.overlaysVisible;
    });
  }

  /**
   * Keeps an existing overlay when geometry is unchanged, otherwise rebuilds.
   *
   * @param mesh Candidate content mesh.
   * @returns True when an overlay remains for the mesh.
   */
  private retainOrRebuildOverlay(mesh: THREE.Mesh): boolean {
    if (!this.canBuildOverlay(mesh)) {
      this.removeOverlayForMesh(mesh);
      return false;
    }
    if (this.tryRetainExistingOverlay(mesh)) {
      return true;
    }
    this.removeOverlayForMesh(mesh);
    this.addMeshOverlay(mesh);
    return this.overlayEntries.has(mesh);
  }

  /**
   * Returns whether a mesh may receive an orange wireframe overlay.
   *
   * @param mesh Candidate mesh.
   * @returns True when overlay geometry can be built.
   */
  private canBuildOverlay(mesh: THREE.Mesh): boolean {
    if (!hasEdgeBuildableGeometry(mesh)) {
      return false;
    }
    if (mesh.userData[SELECTION_HIGHLIGHT_USERDATA_KEY]) {
      return false;
    }
    if (mesh.userData[SOLID_BRUSH_USERDATA_KEY] === true) {
      return false;
    }
    return true;
  }

  /**
   * Reuses a prior overlay when the mesh still uses the same geometry object.
   *
   * @param mesh Mesh that already may have an overlay.
   * @returns True when the existing overlay was retained.
   */
  private tryRetainExistingOverlay(mesh: THREE.Mesh): boolean {
    const existing = this.overlayEntries.get(mesh);
    if (!existing) {
      return false;
    }
    if (this.overlaySourceGeometry.get(mesh) !== mesh.geometry) {
      return false;
    }
    if (existing.parent !== mesh) {
      mesh.add(existing);
    }
    existing.visible = this.overlaysVisible && !isEditModeWireframeSuppressed(existing);
    return true;
  }

  /**
   * Disposes overlays for meshes that are no longer in the active set.
   *
   * @param retainedMeshes Meshes that should keep their overlays.
   */
  private removeOverlaysNotIn(retainedMeshes: ReadonlySet<THREE.Mesh>): void {
    for (const mesh of Array.from(this.overlayEntries.keys())) {
      if (!retainedMeshes.has(mesh)) {
        this.removeOverlayForMesh(mesh);
      }
    }
  }

  /**
   * Removes and disposes the overlay for one mesh when present.
   *
   * @param mesh Mesh whose overlay should be cleared.
   */
  private removeOverlayForMesh(mesh: THREE.Mesh): void {
    const lineSegments = this.overlayEntries.get(mesh);
    if (!lineSegments) {
      return;
    }
    mesh.remove(lineSegments);
    lineSegments.geometry.dispose();
    this.overlayEntries.delete(mesh);
    this.overlaySourceGeometry.delete(mesh);
  }

  /** Removes all overlay LineSegments from their parent meshes. */
  private clearOverlays(): void {
    for (const mesh of Array.from(this.overlayEntries.keys())) {
      this.removeOverlayForMesh(mesh);
    }
  }

  /**
   * Creates a LineSegments overlay parented under a single mesh.
   *
   * @param mesh The source mesh to generate edges from.
   */
  private addMeshOverlay(mesh: THREE.Mesh): void {
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
    const lineSegments = new THREE.LineSegments(edgesGeometry, this.lineMaterial);
    lineSegments.userData['isWireframeOverlay'] = true;
    lineSegments.renderOrder = 997;
    lineSegments.visible = this.overlaysVisible;
    mesh.add(lineSegments);
    this.overlayEntries.set(mesh, lineSegments);
    this.overlaySourceGeometry.set(mesh, mesh.geometry);
  }

  /**
   * Shows or hides all wireframe overlays.
   *
   * @param visible Whether the overlays should be visible.
   */
  setVisible(visible: boolean): void {
    this.overlaysVisible = visible;
    this.overlayEntries.forEach((lineSegments) => {
      if (isEditModeWireframeSuppressed(lineSegments)) {
        lineSegments.visible = false;
        return;
      }
      lineSegments.visible = visible;
    });
  }

  /**
   * Returns whether overlays are currently set to visible.
   *
   * @returns True if overlays should be shown.
   */
  isVisible(): boolean {
    return this.overlaysVisible;
  }

  /** Removes overlays from meshes and disposes all resources. */
  dispose(): void {
    this.clearOverlays();
    this.lineMaterial.dispose();
  }

  /**
   * Returns the number of active overlay entries (for tests).
   *
   * @returns Overlay count.
   */
  getOverlayCount(): number {
    return this.overlayEntries.size;
  }

  /**
   * Returns the overlay for a mesh when present (for tests).
   *
   * @param mesh The mesh to look up.
   * @returns The overlay LineSegments, or undefined.
   */
  getOverlayForMesh(mesh: THREE.Mesh): THREE.LineSegments | undefined {
    return this.overlayEntries.get(mesh);
  }
}
