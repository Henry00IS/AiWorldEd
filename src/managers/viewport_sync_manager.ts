import * as THREE from 'three';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../selection/selection_highlight.js';
import { CLIP_PREVIEW_USERDATA_KEY } from './clip_plane_preview.js';

/**
 * UserData key used to map viewport clone meshes back to world meshes.
 */
export const EDITOR_SOURCE_UUID_KEY = 'editorSourceUuid';

/**
 * UserData key marking a top-level group as a 2D viewport world clone.
 */
export const EDITOR_VIEWPORT_CLONE_KEY = 'isEditorViewportClone';

/**
 * Configuration mapping a viewport to its container element.
 */
export interface ViewportContainerPair {
  /** The viewport instance. */
  viewport: Viewport3D | Viewport2D;

  /** The DOM container element for the viewport. */
  container: HTMLElement;
}

/**
 * Manages synchronization of the world object across multiple viewports.
 * 2D viewports receive deep clones with independent geometry/materials so
 * disposing clones never destroys the authoritative world meshes.
 */
export class ViewportSyncManager {
  private viewport2DTop: Viewport2D;
  private viewport2DFront: Viewport2D;
  private viewport2DSide: Viewport2D;
  private viewport3D: Viewport3D;
  private worldObject: THREE.Group | null;

  /**
   * Creates a new viewport sync manager for the given viewports.
   * @param viewport2DTop The top-down 2D viewport.
   * @param viewport2DFront The front-facing 2D viewport.
   * @param viewport2DSide The side-facing 2D viewport.
   * @param viewport3D The perspective 3D viewport.
   */
  constructor(
    viewport2DTop: Viewport2D,
    viewport2DFront: Viewport2D,
    viewport2DSide: Viewport2D,
    viewport3D: Viewport3D
  ) {
    this.viewport2DTop = viewport2DTop;
    this.viewport2DFront = viewport2DFront;
    this.viewport2DSide = viewport2DSide;
    this.viewport3D = viewport3D;
    this.worldObject = null;
  }

  /**
   * Stores the authoritative world object used for selection remapping.
   * @param worldObject The shared world group.
   */
  setWorldObject(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
  }

  /**
   * Returns all viewport scenes managed by this sync manager.
   * @returns An array of all viewport scene references.
   */
  getAllViewportScenes(): THREE.Scene[] {
    return [
      this.viewport2DTop.getScene(),
      this.viewport2DFront.getScene(),
      this.viewport2DSide.getScene(),
      this.viewport3D.getScene()
    ];
  }

  /**
   * Collects all selectable meshes from the authoritative world object only.
   * @returns An array of world meshes suitable for selection state.
   */
  getWorldSelectableMeshes(): THREE.Mesh[] {
    if (!this.worldObject) return [];
    const meshes: THREE.Mesh[] = [];
    this.worldObject.traverse((child) => {
      if (child instanceof THREE.Mesh && !this.isHelperMesh(child)) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Collects selectable meshes across all viewport scenes, excluding helpers.
   * @returns An array of selectable meshes.
   */
  getAllViewportSelectableMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.getAllViewportScenes().forEach((scene) => {
      scene.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !this.isHelperMesh(child) &&
          !meshes.includes(child)
        ) {
          meshes.push(child);
        }
      });
    });
    return meshes;
  }

  /**
   * Resolves a raycast hit mesh (possibly a 2D clone) to the world mesh.
   * @param hitMesh The mesh returned by raycasting.
   * @returns The corresponding world mesh, or the original if already authoritative.
   */
  resolveToWorldMesh(hitMesh: THREE.Mesh): THREE.Mesh {
    const sourceUuid = hitMesh.userData[EDITOR_SOURCE_UUID_KEY];
    if (typeof sourceUuid !== 'string' || !this.worldObject) {
      return hitMesh;
    }
    const found = this.findMeshByUuid(this.worldObject, sourceUuid);
    return found ?? hitMesh;
  }

  /**
   * Finds a mesh in a hierarchy by UUID.
   * @param root The root to search.
   * @param uuid The UUID to find.
   * @returns The matching mesh, or null.
   */
  findMeshByUuid(root: THREE.Object3D, uuid: string): THREE.Mesh | null {
    let result: THREE.Mesh | null = null;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.uuid === uuid) {
        result = child;
      }
    });
    return result;
  }

  /**
   * Finds clone meshes in all 2D scenes that map to a given world mesh UUID.
   * @param worldUuid The world mesh UUID to match.
   * @returns Matching clone meshes.
   */
  findCloneMeshesForWorldUuid(worldUuid: string): THREE.Mesh[] {
    const clones: THREE.Mesh[] = [];
    [
      this.viewport2DTop.getScene(),
      this.viewport2DFront.getScene(),
      this.viewport2DSide.getScene()
    ].forEach((scene) => {
      scene.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.userData[EDITOR_SOURCE_UUID_KEY] === worldUuid
        ) {
          clones.push(child);
        }
      });
    });
    return clones;
  }

  /**
   * Syncs a world object to all 2D viewport scenes by cloning and replacing.
   * @param worldObject The world object to clone into 2D viewports.
   */
  syncWorldObjectToViewports(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
    this.replaceCloneInScene(this.viewport2DTop.getScene(), worldObject);
    this.replaceCloneInScene(this.viewport2DFront.getScene(), worldObject);
    this.replaceCloneInScene(this.viewport2DSide.getScene(), worldObject);
    this.setupViewportSelectableObjects();
  }

  /**
   * Replaces the previous viewport clone in a scene with a fresh deep clone.
   * @param scene The 2D viewport scene.
   * @param worldObject The authoritative world group.
   */
  private replaceCloneInScene(scene: THREE.Scene, worldObject: THREE.Group): void {
    this.removeOldClones(scene);
    scene.add(this.createTaggedClone(worldObject));
  }

  /**
   * Creates a deep clone with independent geometry and materials.
   * Selection and wireframe overlays are stripped so each viewport owns them.
   * @param worldObject The world object to clone.
   * @returns A tagged clone group for a 2D viewport.
   */
  private createTaggedClone(worldObject: THREE.Group): THREE.Group {
    const clone = worldObject.clone(true);
    clone.userData[EDITOR_VIEWPORT_CLONE_KEY] = true;
    this.stripEditorOverlays(clone);
    this.detachSharedResources(clone);
    this.tagCloneWithSourceUuids(worldObject, clone);
    return clone;
  }

  /**
   * Removes selection highlights and wireframe overlays from a cloned hierarchy.
   * @param root The cloned hierarchy root.
   */
  private stripEditorOverlays(root: THREE.Object3D): void {
    const toRemove: THREE.Object3D[] = [];
    root.traverse((child) => {
      if (this.isEditorOverlayObject(child)) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((child) => {
      child.parent?.remove(child);
      this.disposeObject3D(child);
    });
  }

  /**
   * Returns true for selection outlines and shading wireframe overlays.
   * @param object The object to test.
   * @returns True if the object is an editor-only overlay.
   */
  private isEditorOverlayObject(object: THREE.Object3D): boolean {
    if (object.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (object.userData.isWireframeOverlay === true) return true;
    return false;
  }

  /**
   * Clones geometry and materials so disposing viewport clones is safe.
   * @param root The cloned hierarchy root.
   */
  private detachSharedResources(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        this.detachMeshResources(child);
      }
      if (child instanceof THREE.LineSegments || child instanceof THREE.Line) {
        this.detachLineResources(child);
      }
    });
  }

  /**
   * Gives a mesh its own geometry and material instances.
   * @param mesh The mesh to detach.
   */
  private detachMeshResources(mesh: THREE.Mesh): void {
    if (mesh.geometry) {
      mesh.geometry = mesh.geometry.clone();
    }
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => material.clone());
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  }

  /**
   * Gives a line object its own geometry and material instances.
   * @param line The line object to detach.
   */
  private detachLineResources(line: THREE.Line | THREE.LineSegments): void {
    if (line.geometry) {
      line.geometry = line.geometry.clone();
    }
    if (Array.isArray(line.material)) {
      line.material = line.material.map((material) => material.clone());
    } else if (line.material) {
      line.material = line.material.clone();
    }
  }

  /**
   * Recursively writes source UUID tags from original hierarchy onto clone hierarchy.
   * @param original The original object.
   * @param clone The cloned counterpart at the same hierarchy path.
   */
  private tagCloneWithSourceUuids(
    original: THREE.Object3D,
    clone: THREE.Object3D
  ): void {
    clone.userData[EDITOR_SOURCE_UUID_KEY] = original.uuid;
    const childCount = Math.min(original.children.length, clone.children.length);
    for (let index = 0; index < childCount; index++) {
      this.tagCloneWithSourceUuids(original.children[index], clone.children[index]);
    }
  }

  /**
   * Sets up selectable object references for all viewports.
   */
  private setupViewportSelectableObjects(): void {
    const worldMeshes = this.getWorldSelectableMeshes();
    this.viewport3D.setSelectableObjects(worldMeshes);
    this.viewport2DTop.setSelectableObjects(
      this.collectCloneMeshesFromScene(this.viewport2DTop.getScene())
    );
    this.viewport2DFront.setSelectableObjects(
      this.collectCloneMeshesFromScene(this.viewport2DFront.getScene())
    );
    this.viewport2DSide.setSelectableObjects(
      this.collectCloneMeshesFromScene(this.viewport2DSide.getScene())
    );
  }

  /**
   * Collects clone meshes suitable for raycasting from a 2D scene.
   * @param scene The viewport scene.
   * @returns Selectable clone meshes.
   */
  private collectCloneMeshesFromScene(scene: THREE.Scene): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.userData[EDITOR_SOURCE_UUID_KEY] &&
        !this.isHelperMesh(child)
      ) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Returns true for wireframe helpers and highlight overlays that must not be selected.
   * @param mesh The mesh to test.
   * @returns True if the mesh is a helper.
   */
  private isHelperMesh(mesh: THREE.Object3D): boolean {
    if (mesh.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (mesh.userData[CLIP_PREVIEW_USERDATA_KEY] === true) return true;
    if (mesh.userData.isWireframeOverlay === true) return true;
    if (mesh.userData.isSelectionHighlight) return true;
    if (mesh instanceof THREE.LineSegments && mesh.parent instanceof THREE.Mesh) {
      return true;
    }
    let current: THREE.Object3D | null = mesh.parent;
    while (current) {
      if (current.userData[CLIP_PREVIEW_USERDATA_KEY] === true) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Mirrors transforms from the original world object into 2D viewport clones.
   * @param worldObject The original world object whose children serve as source.
   */
  syncClonePositionsToWorldObject(worldObject: THREE.Group): void {
    this.syncSingleViewportClone(this.viewport2DTop.getScene(), worldObject);
    this.syncSingleViewportClone(this.viewport2DFront.getScene(), worldObject);
    this.syncSingleViewportClone(this.viewport2DSide.getScene(), worldObject);
  }

  /**
   * Syncs clone children in a single viewport scene to match the original world object.
   * @param scene The viewport scene containing the clone group.
   * @param worldObject The original world object with authoritative transforms.
   */
  private syncSingleViewportClone(
    scene: THREE.Scene,
    worldObject: THREE.Group
  ): void {
    const cloneGroup = this.findCloneGroupInScene(scene);
    if (!cloneGroup) return;
    this.syncObjectTransformsRecursively(worldObject, cloneGroup);
  }

  /**
   * Recursively copies local transforms from original to clone hierarchy.
   * @param original The authoritative object.
   * @param clone The viewport clone counterpart.
   */
  private syncObjectTransformsRecursively(
    original: THREE.Object3D,
    clone: THREE.Object3D
  ): void {
    clone.position.copy(original.position);
    clone.quaternion.copy(original.quaternion);
    clone.scale.copy(original.scale);
    clone.visible = original.visible;
    const childCount = Math.min(original.children.length, clone.children.length);
    for (let index = 0; index < childCount; index++) {
      this.syncObjectTransformsRecursively(
        original.children[index],
        clone.children[index]
      );
    }
  }

  /**
   * Locates the cloned world group within a viewport scene.
   * @param scene The scene to search.
   * @returns The marked clone group, or null.
   */
  private findCloneGroupInScene(scene: THREE.Scene): THREE.Group | null {
    for (const child of scene.children) {
      if (child instanceof THREE.Group && child.userData[EDITOR_VIEWPORT_CLONE_KEY]) {
        return child;
      }
    }
    for (const child of scene.children) {
      if (
        child instanceof THREE.Group &&
        child.userData[EDITOR_SOURCE_UUID_KEY]
      ) {
        return child;
      }
    }
    return null;
  }

  /**
   * Removes only editor viewport clone groups from a scene.
   * @param scene The scene to clean up.
   */
  private removeOldClones(scene: THREE.Scene): void {
    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((child) => {
      if (
        child instanceof THREE.Group &&
        (child.userData[EDITOR_VIEWPORT_CLONE_KEY] ||
          child.userData[EDITOR_SOURCE_UUID_KEY])
      ) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => {
      this.disposeObject3D(obj);
      scene.remove(obj);
    });
  }

  /**
   * Recursively disposes geometries and materials of a clone hierarchy.
   * Safe because clones always own independent resources.
   * @param obj The Three.js object whose resources should be disposed.
   */
  private disposeObject3D(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
    const children = obj.children.slice();
    children.forEach((child) => this.disposeObject3D(child));
  }
}
