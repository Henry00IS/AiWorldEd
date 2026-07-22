import * as THREE from 'three';
import { ShadingMode } from '../types/shading_mode.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../selection/selection_highlight.js';
import { BOUNDS_FACE_USERDATA_KEY } from '../types/bounds_face.js';

/**
 * Content-material snapshot for one mesh (supports multi-material arrays).
 */
interface MaterialSnapshot {
  materials: THREE.Material | THREE.Material[];
  wireframeFlags: boolean | boolean[];
}

/**
 * Group names used by editor gizmos that must never receive shading overrides.
 */
const EXEMPT_GROUP_NAMES = new Set([
  'transform_gizmo',
  'transform_gizmo_viewport',
  'bounds_gizmo'
]);

/**
 * Manages material overrides for viewport shading modes.
 * Content materials (including per-object textures) are the source of truth.
 * Snapshots are refreshed from live meshes while in SOLID so texture rebuilds
 * are never overwritten by stale pre-texture material references.
 * FLAT mode shows unlit albedo (color × map) at full brightness — no lighting.
 * WIREFRAME mode hides surface fill so only decorative edge outlines remain.
 */
export class ShadingModeManager {
  private viewportScene: THREE.Scene;
  private materialSnapshots: Map<string, MaterialSnapshot>;
  private activeMode: ShadingMode;
  private ownedOverrideMaterials: Set<THREE.Material>;

  /**
   * Creates a new shading mode manager for the given scene.
   * @param viewportScene The Three.js scene to manage shading for.
   */
  constructor(viewportScene: THREE.Scene) {
    this.viewportScene = viewportScene;
    this.materialSnapshots = new Map();
    this.activeMode = ShadingMode.SOLID;
    this.ownedOverrideMaterials = new Set();
  }

  /**
   * Captures content materials from the scene.
   * In SOLID mode, always refreshes snapshots from live meshes so texture
   * assignment and material rebuilds stick across shading refreshes.
   * In override modes, only adds snapshots for meshes not yet recorded.
   */
  snapshotMaterials(): void {
    const meshes = this.collectContentMeshes();
    if (this.activeMode === ShadingMode.SOLID) {
      meshes.forEach((mesh) => this.captureContentSnapshot(mesh));
      return;
    }
    meshes.forEach((mesh) => {
      if (!this.materialSnapshots.has(mesh.uuid)) {
        this.captureContentSnapshot(mesh);
      }
    });
  }

  /**
   * Applies the specified shading mode to content meshes in the viewport scene.
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
    }
  }

  /**
   * Returns true when an object is an editor helper that must keep its own materials.
   * @param object The object to inspect.
   * @returns True when shading modes must ignore this object.
   */
  isShadingExempt(object: THREE.Object3D): boolean {
    if (this.hasExemptUserData(object)) return true;
    if (this.hasExemptName(object.name)) return true;
    return this.isDescendantOfExemptGroup(object);
  }

  /**
   * Cleans up resources held by this manager.
   */
  dispose(): void {
    this.restoreContentMaterials();
    this.ownedOverrideMaterials.clear();
    this.materialSnapshots.clear();
  }

  /**
   * Collects content meshes only, excluding editor helpers and gizmos.
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
   * Checks userData flags used by gizmos, selection, and overlays.
   * @param object The object to inspect.
   * @returns True when a known helper flag is present.
   */
  private hasExemptUserData(object: THREE.Object3D): boolean {
    const data = object.userData;
    if (data[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (data.isSelectionHighlight === true) return true;
    if (data.isWireframeOverlay === true) return true;
    if (data.isFaceSelectionHighlight === true) return true;
    if (data.isClipPlanePreview === true) return true;
    if (data.isBoundsFacePick === true) return true;
    if (data.isBoundsGuideLines === true) return true;
    if (data.isGizmoOccludedGhost === true) return true;
    if (data.handleId !== undefined) return true;
    if (data[BOUNDS_FACE_USERDATA_KEY] !== undefined) return true;
    return false;
  }

  /**
   * Checks object names used by bounds gizmo parts.
   * @param name The object name.
   * @returns True when the name marks an editor helper.
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

  /**
   * Stores the mesh's current materials as its content snapshot.
   * @param mesh Mesh to capture.
   */
  private captureContentSnapshot(mesh: THREE.Mesh): void {
    const materials = mesh.material;
    if (!materials) return;
    if (Array.isArray(materials)) {
      if (materials.length === 0) return;
      this.materialSnapshots.set(mesh.uuid, {
        materials: materials.slice(),
        wireframeFlags: materials.map((entry) => entry.wireframe)
      });
      return;
    }
    this.materialSnapshots.set(mesh.uuid, {
      materials,
      wireframeFlags: materials.wireframe
    });
  }

  /**
   * Restores every snapshotted mesh to its content materials.
   */
  private restoreContentMaterials(): void {
    this.disposeOwnedOverrideMaterials();
    this.materialSnapshots.forEach((snapshot, meshUuid) => {
      const mesh = this.findMeshByUuid(meshUuid);
      if (!mesh) return;
      this.restoreMeshMaterial(mesh, snapshot);
    });
  }

  /**
   * Finds a mesh in the viewport scene by its UUID.
   * @param uuid The mesh UUID to search for.
   * @returns The mesh if found, or null otherwise.
   */
  private findMeshByUuid(uuid: string): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;
    this.viewportScene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.uuid === uuid) {
        found = child;
      }
    });
    return found;
  }

  /**
   * Restores a mesh to its content material and wireframe flags.
   * @param mesh The mesh to restore.
   * @param snapshot The content material snapshot.
   */
  private restoreMeshMaterial(
    mesh: THREE.Mesh,
    snapshot: MaterialSnapshot
  ): void {
    mesh.material = snapshot.materials;
    if (Array.isArray(snapshot.materials)) {
      const flags = snapshot.wireframeFlags as boolean[];
      snapshot.materials.forEach((material, index) => {
        material.wireframe = flags[index] ?? false;
      });
      return;
    }
    snapshot.materials.wireframe = snapshot.wireframeFlags as boolean;
  }

  /**
   * Hides surface fill so only decorative white edge outlines remain visible.
   * Surfaces still write depth so outlines occlude correctly.
   */
  private applyWireframeMode(): void {
    const meshes = this.collectContentMeshes();
    meshes.forEach((mesh) => {
      const contentMaterials = this.getContentMaterialsForMesh(mesh);
      const outlineOnlyMaterials = contentMaterials.map((source) =>
        this.createOutlineOnlySurfaceMaterial(source)
      );
      outlineOnlyMaterials.forEach((material) => {
        this.ownedOverrideMaterials.add(material);
      });
      mesh.material =
        outlineOnlyMaterials.length === 1
          ? outlineOnlyMaterials[0]
          : outlineOnlyMaterials;
    });
  }

  /**
   * Builds a surface material that contributes depth but no color.
   * Decorative edge LineSegments on the mesh provide the visible outlines.
   * @param source Content material used only for side/culling settings.
   * @returns MeshBasicMaterial with color writes disabled.
   */
  private createOutlineOnlySurfaceMaterial(
    source: THREE.Material
  ): THREE.MeshBasicMaterial {
    const side =
      'side' in source
        ? (source as THREE.MeshStandardMaterial).side
        : THREE.FrontSide;
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side,
      toneMapped: false
    });
    material.colorWrite = false;
    material.depthWrite = true;
    return material;
  }

  /**
   * Applies unlit flat shading: full-brightness albedo from content materials.
   * Uses MeshBasicMaterial so lighting cannot darken surfaces.
   */
  private applyFlatMode(): void {
    const meshes = this.collectContentMeshes();
    meshes.forEach((mesh) => {
      const contentMaterials = this.getContentMaterialsForMesh(mesh);
      const flatMaterials = contentMaterials.map((source) =>
        this.createUnlitAlbedoMaterial(source)
      );
      flatMaterials.forEach((material) => {
        this.ownedOverrideMaterials.add(material);
      });
      mesh.material =
        flatMaterials.length === 1 ? flatMaterials[0] : flatMaterials;
    });
  }

  /**
   * Resolves content materials for a mesh (snapshot preferred, else live).
   * @param mesh Mesh to inspect.
   * @returns Content material list.
   */
  private getContentMaterialsForMesh(mesh: THREE.Mesh): THREE.Material[] {
    const snapshot = this.materialSnapshots.get(mesh.uuid);
    if (snapshot) {
      return Array.isArray(snapshot.materials)
        ? snapshot.materials
        : [snapshot.materials];
    }
    const live = mesh.material;
    if (Array.isArray(live)) return live;
    return live ? [live] : [];
  }

  /**
   * Builds an unlit material that shows the source albedo at full brightness.
   * @param source Content material to mirror.
   * @returns MeshBasicMaterial with color and map from source.
   */
  private createUnlitAlbedoMaterial(
    source: THREE.Material
  ): THREE.MeshBasicMaterial {
    const color = readMaterialColorHex(source);
    const map = readMaterialMap(source);
    const side =
      'side' in source
        ? (source as THREE.MeshStandardMaterial).side
        : THREE.FrontSide;
    return new THREE.MeshBasicMaterial({
      color,
      map,
      side,
      toneMapped: false
    });
  }

  /**
   * Disposes override materials created for FLAT or WIREFRAME modes.
   */
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
 * Reads a material color hex when present.
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
 * @param material Material to inspect.
 * @returns Texture or null.
 */
function readMaterialMap(material: THREE.Material): THREE.Texture | null {
  if (!('map' in material)) return null;
  const map = (material as THREE.MeshStandardMaterial).map;
  return map ?? null;
}
