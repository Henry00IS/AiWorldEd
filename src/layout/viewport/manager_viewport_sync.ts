import * as THREE from 'three';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '@/tools/clip_plane/clip_plane_preview.js';
import { EDITOR_SOURCE_UUID_KEY } from './viewport_sync_keys.js';

export { EDITOR_SOURCE_UUID_KEY } from './viewport_sync_keys.js';

/** Configuration mapping a viewport to its container element. */
export interface ViewportContainerPair {
  /** The viewport instance. */
  viewport: Viewport3D | Viewport2D;

  /** The DOM container element for the viewport. */
  container: HTMLElement;
}

/**
 * Synchronizes selectable mesh lists on live viewports with a stored world
 * object.
 */
export class ManagerViewportSync {
  private allViewports: ViewportEditor[];
  private worldObject: THREE.Group | null;

  /**
   * Creates a sync manager from optional seed viewports.
   *
   * @param viewport2DTop Top orthographic viewport, or null.
   * @param viewport2DFront Front orthographic viewport, or null.
   * @param viewport2DSide Side orthographic viewport, or null.
   * @param viewport3D Perspective viewport, or null.
   */
  constructor(
    viewport2DTop: Viewport2D | null,
    viewport2DFront: Viewport2D | null,
    viewport2DSide: Viewport2D | null,
    viewport3D: Viewport3D | null,
  ) {
    this.allViewports = [];
    this.worldObject = null;
    const seed = [viewport2DTop, viewport2DFront, viewport2DSide, viewport3D].filter(
      (viewport): viewport is ViewportEditor => viewport !== null,
    );
    this.setViewportRoles(null, seed);
  }

  /**
   * Replaces the stored live viewport list.
   *
   * @param _hostViewport Unused.
   * @param viewports Live editor viewports to store.
   */
  setViewportRoles(_hostViewport: ViewportEditor | null, viewports: readonly ViewportEditor[]): void {
    this.allViewports = [...viewports];
  }

  /**
   * Stores the world group used when collecting selectable meshes.
   *
   * @param worldObject The world group to store.
   */
  setWorldObject(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
  }

  /**
   * Returns the stored world group when set.
   *
   * @returns The stored world group, or null when none has been set.
   */
  getWorldObject(): THREE.Group | null {
    return this.worldObject;
  }

  /**
   * Returns unique scene roots from the live viewports.
   *
   * @returns An array of distinct scene references.
   */
  getAllViewportScenes(): THREE.Scene[] {
    const scenes: THREE.Scene[] = [];
    this.allViewports.forEach((viewport) => {
      const scene = viewport.getScene();
      if (!scenes.includes(scene)) scenes.push(scene);
    });
    return scenes;
  }

  /**
   * Collects selectable meshes under the stored world object, excluding
   * helpers.
   *
   * @returns An array of non-helper meshes from the world object, or empty when
   *   none is set.
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
   * Returns selectable meshes from the stored world object, excluding helpers.
   *
   * @returns An array of selectable meshes.
   */
  getAllViewportSelectableMeshes(): THREE.Mesh[] {
    return this.getWorldSelectableMeshes();
  }

  /**
   * Resolves a raycast hit mesh to the world mesh matching its source UUID when
   * present.
   *
   * @param hitMesh The mesh returned by raycasting.
   * @returns The matching world mesh, or the hit mesh when no source UUID or
   *   match applies.
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
   *
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
   * Stores the world object and assigns its selectable meshes to every live
   * viewport.
   *
   * @param worldObject The world group whose selectable meshes are applied.
   */
  syncWorldObjectToViewports(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
    const worldMeshes = this.getWorldSelectableMeshes();
    this.allViewports.forEach((viewport) => viewport.setSelectableObjects(worldMeshes));
  }

  /**
   * Returns whether the object is a helper overlay rather than a solid mesh.
   *
   * @param mesh The object to test.
   * @returns True when the object is classified as a helper.
   */
  private isHelperMesh(mesh: THREE.Object3D): boolean {
    if (mesh.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (mesh.userData[CLIP_PREVIEW_USERDATA_KEY] === true) return true;
    if (mesh.userData['isWireframeOverlay'] === true) return true;
    if (mesh.userData['isSelectionHighlight']) return true;
    if (mesh.userData['isSolidModelResult'] === true) return true;
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
}
