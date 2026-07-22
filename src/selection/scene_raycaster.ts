import * as THREE from 'three';
import { pointerEventToNdc } from '../utils/pointer_ndc.js';

/**
 * Shared raycasting utility for click-to-select across all viewports.
 * Keeps camera and mesh world matrices current and uses double-sided
 * material intersection so visible faces pick reliably from any angle.
 */
export class SceneRaycaster {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;

  /**
   * Creates a new shared raycaster instance for click-to-select operations.
   */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
  }

  /**
   * Casts a ray from the camera through the mouse position against selectable objects.
   * @param camera The camera to cast from.
   * @param renderer The renderer for canvas dimensions.
   * @param event The mouse event providing the click position.
   * @param selectableObjects The array of meshes to test against.
   * @returns The first intersected mesh, or null if no intersection.
   */
  cast(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    selectableObjects: THREE.Mesh[]
  ): THREE.Mesh | null {
    if (selectableObjects.length === 0) return null;
    this.prepareCameraAndMeshes(camera, selectableObjects);
    pointerEventToNdc(event, renderer.domElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
    const restored = this.enableDoubleSidedPicking(selectableObjects);
    const intersections = this.raycaster.intersectObjects(selectableObjects, false);
    this.restoreMaterialSides(restored);
    return this.firstMeshHit(intersections);
  }

  /**
   * Updates camera and mesh world matrices so ray origins and hit tests match the view.
   * @param camera The camera used for the ray.
   * @param meshes The meshes that will be tested.
   */
  private prepareCameraAndMeshes(
    camera: THREE.Camera,
    meshes: THREE.Mesh[]
  ): void {
    camera.updateMatrixWorld(true);
    meshes.forEach((mesh) => {
      mesh.updateMatrixWorld(true);
    });
  }

  /**
   * Temporarily enables DoubleSide on materials so back-facing triangles still pick.
   * @param meshes The meshes being picked.
   * @returns Previous side values for restoration.
   */
  private enableDoubleSidedPicking(
    meshes: THREE.Mesh[]
  ): Array<{ material: THREE.Material; side: THREE.Side }> {
    const restored: Array<{ material: THREE.Material; side: THREE.Side }> = [];
    meshes.forEach((mesh) => {
      this.snapshotAndForceDoubleSide(mesh, restored);
    });
    return restored;
  }

  /**
   * Snapshots material sides on a mesh and forces DoubleSide for picking.
   * @param mesh The mesh whose materials should be temporarily double-sided.
   * @param restored Accumulator for side restoration data.
   */
  private snapshotAndForceDoubleSide(
    mesh: THREE.Mesh,
    restored: Array<{ material: THREE.Material; side: THREE.Side }>
  ): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      restored.push({ material, side: material.side });
      material.side = THREE.DoubleSide;
    });
  }

  /**
   * Restores material side values after object picking.
   * @param restored Previous material side snapshots.
   */
  private restoreMaterialSides(
    restored: Array<{ material: THREE.Material; side: THREE.Side }>
  ): void {
    restored.forEach((entry) => {
      entry.material.side = entry.side;
    });
  }

  /**
   * Returns the closest mesh from a sorted intersection list.
   * @param intersections Raycast hits sorted by distance.
   * @returns The hit mesh, or null when no mesh was hit.
   */
  private firstMeshHit(intersections: THREE.Intersection[]): THREE.Mesh | null {
    for (const hit of intersections) {
      if (hit.object instanceof THREE.Mesh) {
        return hit.object;
      }
    }
    return null;
  }

  /**
   * Disposes internal Three.js resources.
   * Raycaster and Vector2 do not require explicit disposal.
   */
  dispose(): void {
  }
}
