import * as THREE from 'three';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { rebuildDecorativeEdges, usesContentDecorativeEdges } from '@/utils/mesh_edge_sync.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SOLID_BRUSH_EDGE_USERDATA_KEY } from '@/solid/model/solid_brush_edge_materials.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';

/**
 * Pure utility for deep-cloning meshes. Handles geometry, material, and content
 * decorative edges. Solid brush meshes keep operation-colored brush edges only
 * (no white outlines). Never copies selection outlines or shading wireframe
 * overlays.
 */
export class ObjectDuplicator {
  /**
   * Deep clones an array of meshes with positional offset.
   *
   * @param meshes The source meshes to duplicate.
   * @param offset The vector offset to apply to each clone's position.
   * @returns An array of new meshes, NOT added to any parent.
   */
  public static duplicate(meshes: THREE.Mesh[], offset: THREE.Vector3): THREE.Mesh[] {
    const clones: THREE.Mesh[] = [];
    meshes.forEach((mesh) => {
      const clone = this.cloneSingleMesh(mesh);
      clone.position.add(offset);
      clones.push(clone);
    });
    return clones;
  }

  /**
   * Deep clones a single mesh with geometry, material, and decorative edges.
   *
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
    clone.name = hierarchyNameAllocator.allocateFromSourceName(mesh.name);
    this.cloneUserDataMarkers(mesh, clone);
    ModifierVolumeBevel.copyOntoClone(mesh, clone);
    this.cloneFaceTextureMaps(mesh, clone);
    this.cloneEdgeHelpers(mesh, clone);
    return clone;
  }

  /**
   * Copies structural userData markers needed for solid brush / result
   * identity.
   *
   * @param source Source mesh.
   * @param target Cloned mesh.
   */
  private static cloneUserDataMarkers(source: THREE.Mesh, target: THREE.Mesh): void {
    if (SolidBrushVisual.isBrushObject(source)) {
      SolidBrushVisual.stampBrushHelperMetadata(target);
      const brushId = SolidBrushVisual.getBrushId(source);
      if (brushId) SolidBrushVisual.setBrushId(target, brushId);
      const operation = source.userData['solidBrushOperation'];
      if (typeof operation === 'string') {
        target.userData['solidBrushOperation'] = operation;
      }
      target.userData['solidBrushHullFillVisible'] = source.userData['solidBrushHullFillVisible'] === true;
    }
  }

  /**
   * Copies face texture map tables so duplicates keep independent assignments.
   *
   * @param source Source mesh.
   * @param target Cloned mesh.
   */
  private static cloneFaceTextureMaps(source: THREE.Mesh, target: THREE.Mesh): void {
    const maps = getFaceTextureMaps(source);
    if (maps.length === 0) return;
    setFaceTextureMaps(target, maps);
  }

  /**
   * Clones a material or material array.
   *
   * @param material The source material(s).
   * @returns Cloned material instance(s).
   */
  private static cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
    if (Array.isArray(material)) {
      return material.map((entry) => entry.clone());
    }
    return material.clone();
  }

  /**
   * Recreates the correct edge helpers for content meshes or solid brush
   * previews.
   *
   * @param source The original mesh.
   * @param target The cloned mesh.
   */
  private static cloneEdgeHelpers(source: THREE.Mesh, target: THREE.Mesh): void {
    if (SolidBrushVisual.isBrushObject(source)) {
      const operation = this.readBrushOperation(source);
      const fillVisible = source.userData['solidBrushHullFillVisible'] === true;
      target.userData['solidBrushHullFillVisible'] = fillVisible;
      SolidBrushVisual.applyOperationStyle(target, operation);
      return;
    }
    if (!usesContentDecorativeEdges(target)) return;
    if (this.sourceHasContentOutlineEdges(source)) {
      rebuildDecorativeEdges(target);
    }
  }

  /**
   * Returns whether the source mesh carries content outline edges to preserve.
   * Ignores selection/wireframe overlays and solid brush edge helpers.
   *
   * @param source Source mesh.
   * @returns True when content outline edges should be rebuilt on the clone.
   */
  private static sourceHasContentOutlineEdges(source: THREE.Mesh): boolean {
    return source.children.some((child) => {
      if (!(child instanceof THREE.LineSegments)) return false;
      if (this.isEditorOverlayLine(child)) return false;
      if (child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true) return false;
      return true;
    });
  }

  /**
   * Reads CSG operation stored on a brush mesh.
   *
   * @param mesh Brush preview mesh.
   * @returns Operation for edge tint.
   */
  private static readBrushOperation(mesh: THREE.Mesh): SolidOperation {
    const value = mesh.userData['solidBrushOperation'];
    if (value === SolidOperation.Subtractive) return SolidOperation.Subtractive;
    if (value === SolidOperation.Intersecting) return SolidOperation.Intersecting;
    return SolidOperation.Additive;
  }

  /**
   * Returns true for selection outlines and wireframe overlays that must not
   * clone.
   *
   * @param line The line object to test.
   * @returns True if the line is an editor-only overlay.
   */
  private static isEditorOverlayLine(line: THREE.LineSegments): boolean {
    if (line.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (line.userData['isSelectionHighlight'] === true) return true;
    if (line.userData['isWireframeOverlay'] === true) return true;
    return false;
  }
}
