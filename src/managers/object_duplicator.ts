import * as THREE from 'three';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../selection/selection_highlight.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '../utils/mesh_edge_sync.js';
import {
  getFaceTextureMaps,
  setFaceTextureMaps
} from '../texture/face_texture_storage.js';

/**
 * Pure utility for deep-cloning meshes.
 * Handles geometry, material, decorative wireframe edges, and naming.
 * Never copies selection outlines or shading wireframe overlays.
 */
export class ObjectDuplicator {

  /**
   * Deep clones an array of meshes with positional offset.
   * @param meshes The source meshes to duplicate.
   * @param offset The vector offset to apply to each clone's position.
   * @returns An array of new meshes, NOT added to any parent.
   */
  public static duplicate(meshes: THREE.Mesh[], offset: THREE.Vector3): THREE.Mesh[] {
    const clones: THREE.Mesh[] = [];
    meshes.forEach((mesh) => {
      const clone = this.cloneSingleMesh(mesh);
      clone.position.add(offset);
      clone.name = this.getNextDuplicateName(mesh.name);
      clones.push(clone);
    });
    return clones;
  }

  /**
   * Computes the next duplicate name for an original mesh name.
   * @param originalName The name of the original mesh.
   * @returns A new name with _copy or incremented suffix.
   */
  public static getNextDuplicateName(originalName: string): string {
    if (originalName.endsWith('_copy')) {
      const base = originalName.slice(0, -5);
      const suffix = this.extractCopySuffix(originalName);
      if (suffix > 0) {
        return `${base}_copy${suffix + 1}`;
      }
      return `${base}_copy2`;
    }
    const suffix = this.extractCopySuffix(originalName);
    if (suffix > 0) {
      const base = originalName.replace(/_copy\d+$/, '');
      return `${base}_copy${suffix + 1}`;
    }
    return `${originalName}_copy`;
  }

  /**
   * Deep clones a single mesh with geometry, material, and decorative edges.
   * @param mesh The source mesh to clone.
   * @returns A new independent mesh with cloned resources.
   */
  private static cloneSingleMesh(mesh: THREE.Mesh): THREE.Mesh {
    const clonedGeometry = mesh.geometry.clone();
    const clonedMaterial = this.cloneMaterial(mesh.material);
    const clone = new THREE.Mesh(clonedGeometry, clonedMaterial);
    clone.position.copy(mesh.position);
    clone.quaternion.copy(mesh.quaternion);
    clone.scale.copy(mesh.scale);
    clone.name = mesh.name;
    this.cloneFaceTextureMaps(mesh, clone);
    this.cloneDecorativeEdges(mesh, clone, clonedGeometry);
    return clone;
  }

  /**
   * Copies face texture map tables so duplicates keep independent assignments.
   * @param source Source mesh.
   * @param target Cloned mesh.
   */
  private static cloneFaceTextureMaps(
    source: THREE.Mesh,
    target: THREE.Mesh
  ): void {
    const maps = getFaceTextureMaps(source);
    if (maps.length === 0) return;
    setFaceTextureMaps(target, maps);
  }

  /**
   * Clones a material or material array.
   * @param material The source material(s).
   * @returns Cloned material instance(s).
   */
  private static cloneMaterial(
    material: THREE.Material | THREE.Material[]
  ): THREE.Material | THREE.Material[] {
    if (Array.isArray(material)) {
      return material.map((entry) => entry.clone());
    }
    return material.clone();
  }

  /**
   * Recreates decorative wireframe edge lines on the cloned mesh.
   * Skips selection outlines and shading wireframe overlays.
   * @param source The original mesh containing wireframe children.
   * @param target The cloned mesh to add wireframe to.
   * @param clonedGeometry The cloned geometry for edge derivation.
   */
  private static cloneDecorativeEdges(
    source: THREE.Mesh,
    target: THREE.Mesh,
    clonedGeometry: THREE.BufferGeometry
  ): void {
    source.children.forEach((child) => {
      if (!(child instanceof THREE.LineSegments)) return;
      if (this.isEditorOverlayLine(child)) return;
      const edges = new THREE.EdgesGeometry(clonedGeometry, 1);
      const lineMaterial = (child.material as THREE.Material).clone();
      const line = new THREE.LineSegments(edges, lineMaterial);
      line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
      target.add(line);
    });
  }

  /**
   * Returns true for selection outlines and wireframe overlays that must not clone.
   * @param line The line object to test.
   * @returns True if the line is an editor-only overlay.
   */
  private static isEditorOverlayLine(line: THREE.LineSegments): boolean {
    if (line.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (line.userData.isSelectionHighlight === true) return true;
    if (line.userData.isWireframeOverlay === true) return true;
    return false;
  }

  /**
   * Extracts the numeric copy suffix from a name string.
   * @param name The name string to inspect.
   * @returns The suffix number, or zero if none found.
   */
  private static extractCopySuffix(name: string): number {
    const match = name.match(/_copy(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 0;
  }
}
