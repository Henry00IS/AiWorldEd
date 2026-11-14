import * as THREE from 'three';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { BOUNDS_FACE_USERDATA_KEY } from '@/types/bounds_face.js';
import { SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { modifierVolumeIs } from '@/modifier/volume/modifier_volume_is.js';
import { createContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { Theme } from '@/theme.js';
import {
  captureSharedContentMaterials,
  markShadingOverrideMaterial,
  resolveSharedContentMaterialList,
  restoreSharedContentMaterials,
} from '@/viewports/shared/shared_content_material_store.js';

/** Object names that mark groups exempt from shading material overrides. */
const EXEMPT_GROUP_NAMES = new Set(['gizmo_transform', 'gizmo_transform_viewport', 'gizmo_bounds']);

/** Applies and restores viewport shading mode material overrides on a scene. */
export class ManagerShadingMode {
  private viewportScene: THREE.Scene;
  private activeMode: ShadingMode;
  private ownedOverrideMaterials: Set<THREE.Material>;

  /**
   * Creates a new shading mode manager for the given scene.
   *
   * @param viewportScene The Three.js scene to manage shading for.
   */
  constructor(viewportScene: THREE.Scene) {
    this.viewportScene = viewportScene;
    this.activeMode = ShadingMode.SOLID;
    this.ownedOverrideMaterials = new Set();
  }

  /**
   * Captures content materials from the scene when live materials are not
   * temporary shading overrides.
   */
  snapshotMaterials(): void {
    this.collectContentMeshes().forEach((mesh) => captureSharedContentMaterials(mesh));
  }

  /**
   * Applies the specified shading mode to content meshes in the viewport scene.
   *
   * @param mode The shading mode to apply.
   */
  setMode(mode: ShadingMode): void {
    this.restoreContentMaterials();
    this.activeMode = mode;
    if (mode === ShadingMode.WIREFRAME) {
      this.applyWireframeMode();
      return;
    }
    if (mode === ShadingMode.FLAT) {
      this.applyFlatMode();
      return;
    }
    if (mode === ShadingMode.CLAY) {
      this.applyClayMode();
    }
  }

  /**
   * Returns the mode last applied by this manager instance.
   *
   * @returns Active shading mode.
   */
  getActiveMode(): ShadingMode {
    return this.activeMode;
  }

  /**
   * Returns true when an object is an editor helper that must keep its own
   * materials.
   *
   * @param object The object to inspect.
   * @returns True when shading modes must ignore this object.
   */
  isShadingExempt(object: THREE.Object3D): boolean {
    if (this.hasExemptUserData(object)) return true;
    if (this.hasExemptName(object.name)) return true;
    return this.isDescendantOfExemptGroup(object);
  }

  /** Cleans up resources held by this manager. */
  dispose(): void {
    this.restoreContentMaterials();
    this.ownedOverrideMaterials.clear();
  }

  /**
   * Collects content meshes only, excluding editor helpers and gizmos.
   *
   * @returns An array of meshes that participate in shading modes.
   */
  private collectContentMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.viewportScene.traverse((child) => {
      if (child instanceof THREE.Mesh && !this.isShadingExempt(child)) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Inspects the object's userData for known exemption flags and keys.
   *
   * @param object The object whose userData is checked.
   * @returns True when any checked exemption flag or key is present.
   */
  private hasExemptUserData(object: THREE.Object3D): boolean {
    const data = object.userData;
    if (data[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (data['isSelectionHighlight'] === true) return true;
    if (data['isWireframeOverlay'] === true) return true;
    if (data['isFaceSelectionHighlight'] === true) return true;
    if (data['isClipPlanePreview'] === true) return true;
    if (data['isBoundsFacePick'] === true) return true;
    if (data['isBoundsGuideLines'] === true) return true;
    if (data['isGizmoOccludedGhost'] === true) return true;
    if (data[SOLID_BRUSH_USERDATA_KEY] === true) return true;
    if (modifierVolumeIs(object)) return true;
    if (data['isDecalPresentation'] === true || DecalProjectorSettingsStore.isProjector(object)) return true;
    if (data['handleId'] !== undefined) return true;
    if (data[BOUNDS_FACE_USERDATA_KEY] !== undefined) return true;
    return false;
  }

  /**
   * Returns true when the name matches an exemption prefix, exact name, or
   * exempt group name.
   *
   * @param name The object name to test.
   * @returns True when the name marks the object as shading-exempt.
   */
  private hasExemptName(name: string): boolean {
    if (!name) return false;
    if (name.startsWith('bounds_handle_')) return true;
    if (name.startsWith('bounds_face_pick_')) return true;
    if (name === 'bounds_wireframe') return true;
    return EXEMPT_GROUP_NAMES.has(name);
  }

  /**
   * Walks parents looking for a transform or bounds gizmo root.
   *
   * @param object The starting object.
   * @returns True when any ancestor is an exempt gizmo group.
   */
  private isDescendantOfExemptGroup(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object.parent;
    while (current) {
      if (EXEMPT_GROUP_NAMES.has(current.name)) return true;
      current = current.parent;
    }
    return false;
  }

  /** Restores every content mesh from the shared content material store. */
  private restoreContentMaterials(): void {
    this.disposeOwnedOverrideMaterials();
    this.collectContentMeshes().forEach((mesh) => {
      restoreSharedContentMaterials(mesh);
    });
  }

  /**
   * Hides surface fill so only decorative edge outlines remain visible. Does
   * not write depth: invisible shells must not occlude brush wires, edit cages,
   * or selection lines in pure wireframe mode.
   */
  private applyWireframeMode(): void {
    this.applyOverrideMaterials(this.collectContentMeshes(), (source) => this.createOutlineOnlySurfaceMaterial(source));
  }

  /**
   * Replaces the shared content materials of each mesh with overrides built
   * from them, tracking every override for later dispose.
   *
   * @param meshes Content meshes to override.
   * @param createOverride Builds one override from a content material.
   */
  private applyOverrideMaterials(
    meshes: readonly THREE.Mesh[],
    createOverride: (source: THREE.Material) => THREE.Material,
  ): void {
    meshes.forEach((mesh) => {
      const contentMaterials = resolveSharedContentMaterialList(mesh);
      if (contentMaterials.length === 0) return;
      const overrideMaterials = contentMaterials.map((source) => createOverride(source));
      overrideMaterials.forEach((material) => this.trackOverrideMaterial(material));
      mesh.material = pickMaterialOrArray(overrideMaterials);
    });
  }

  /**
   * Builds a surface material that draws neither color nor depth so permanent
   * edge lines and edit overlays stay fully visible through the mesh.
   *
   * @param source Content material used only for side/culling settings.
   * @returns MeshBasicMaterial with color and depth writes disabled.
   */
  private createOutlineOnlySurfaceMaterial(source: THREE.Material): THREE.MeshBasicMaterial {
    const side = 'side' in source ? (source as THREE.MeshStandardMaterial).side : THREE.FrontSide;
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side,
      toneMapped: false,
    });
    material.colorWrite = false;
    material.depthWrite = false;
    material.depthTest = false;
    return material;
  }

  /**
   * Applies unlit flat shading from shared content materials. Modifier volume
   * and generator boxes are exempt like brush hulls: translucent fill only
   * while selected, outline otherwise.
   */
  private applyFlatMode(): void {
    this.applyOverrideMaterials(this.collectContentMeshes(), (source) => this.createUnlitAlbedoMaterial(source));
  }

  /** Applies untextured neutral lit shading. */
  private applyClayMode(): void {
    this.applyOverrideMaterials(this.collectContentMeshes(), (source) => this.createClaySurfaceMaterial(source));
  }

  /**
   * Builds the neutral untextured lit material used by Clay shading. Lighting
   * follows the mesh normals, so smoothing stays visible.
   *
   * @param source Content material used only for side/culling settings.
   * @returns Content view-lit material without an albedo map.
   */
  private createClaySurfaceMaterial(source: THREE.Material): THREE.Material {
    const side = 'side' in source ? (source as THREE.MeshStandardMaterial).side : THREE.FrontSide;
    return createContentViewLitMaterial(Theme.shadingClaySurfaceColor, null, { side });
  }

  /**
   * Builds an unlit material that shows the source albedo at full brightness.
   *
   * @param source Content material to mirror.
   * @returns MeshBasicMaterial with color and map from source.
   */
  private createUnlitAlbedoMaterial(source: THREE.Material): THREE.MeshBasicMaterial {
    const color = readMaterialColorHex(source);
    const map = readMaterialMap(source);
    const side = 'side' in source ? (source as THREE.MeshStandardMaterial).side : THREE.FrontSide;
    return new THREE.MeshBasicMaterial({
      color,
      map,
      side,
      toneMapped: false,
    });
  }

  /**
   * Tracks and tags an override material for later dispose.
   *
   * @param material Temporary shading material.
   */
  private trackOverrideMaterial(material: THREE.Material): void {
    markShadingOverrideMaterial(material);
    this.ownedOverrideMaterials.add(material);
  }

  /** Disposes override materials created for FLAT, WIREFRAME or CLAY modes. */
  private disposeOwnedOverrideMaterials(): void {
    this.ownedOverrideMaterials.forEach((material) => {
      if ('map' in material) {
        (material as THREE.MeshBasicMaterial).map = null;
      }
      material.dispose();
    });
    this.ownedOverrideMaterials.clear();
  }
}

/**
 * Picks a single material or the full array for mesh assignment.
 *
 * @param materials Built override materials (non-empty).
 * @returns Material or material array suitable for mesh.material.
 */
function pickMaterialOrArray(materials: THREE.Material[]): THREE.Material | THREE.Material[] {
  const first = materials[0];
  if (materials.length === 1 && first !== undefined) return first;
  return materials;
}

/**
 * Reads a material color hex when present.
 *
 * @param material Material to inspect.
 * @returns Color hex, default white.
 */
function readMaterialColorHex(material: THREE.Material): number {
  if (!('color' in material)) return 0xffffff;
  const color = (material as THREE.MeshStandardMaterial).color;
  if (!(color instanceof THREE.Color)) return 0xffffff;
  return color.getHex();
}

/**
 * Reads a material diffuse map when present.
 *
 * @param material Material to inspect.
 * @returns Texture or null.
 */
function readMaterialMap(material: THREE.Material): THREE.Texture | null {
  if (!('map' in material)) return null;
  const map = (material as THREE.MeshStandardMaterial).map;
  return map ?? null;
}
