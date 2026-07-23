import * as THREE from 'three';
import { pointerEventToNdc } from '../utils/pointer_ndc.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';

/**
 * Result of a face picking operation.
 */
export interface FacePickResult {
  mesh: THREE.Mesh;
  faceIndex: number;
  hitPoint: THREE.Vector3;
}

/**
 * Performs triangle-precision raycasting for face picking on meshes.
 * Updates world matrices and uses DoubleSide intersection so all faces pick reliably.
 */
export class FaceSelectionRaycaster {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;

  /**
   * Creates a new face selection raycaster.
   */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
  }

  /**
   * Picks a face from a set of meshes at the given mouse position.
   * Returns the closest face intersection with the triangle index.
   * @param event The mouse event providing click coordinates.
   * @param camera The camera to cast the ray from.
   * @param renderer The renderer for canvas dimension queries.
   * @param meshes The meshes to test for intersection.
   * @returns A face pick result, or null if no face was hit.
   */
  pickFace(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    meshes: THREE.Mesh[]
  ): FacePickResult | null {
    if (meshes.length === 0) return null;
    this.prepareMeshesForPicking(meshes);
    camera.updateMatrixWorld(true);
    this.setRayFromEvent(event, camera, renderer);
    const restored = this.enableDoubleSidedPicking(meshes);
    const intersections = this.raycaster.intersectObjects(meshes, false);
    this.restoreMaterialSides(restored);
    const hit = this.findFirstMeshHit(intersections, meshes);
    if (!hit) return null;
    return {
      mesh: hit.object as THREE.Mesh,
      faceIndex: this.extractFaceIndex(hit),
      hitPoint: hit.point.clone()
    };
  }

  /**
   * Temporarily enables DoubleSide on materials so all faces are pickable.
   * @param meshes The meshes being picked.
   * @returns Previous side values for restoration.
   */
  private enableDoubleSidedPicking(
    meshes: THREE.Mesh[]
  ): Array<{ material: THREE.Material; side: THREE.Side }> {
    const restored: Array<{ material: THREE.Material; side: THREE.Side }> = [];
    meshes.forEach((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (!material) return;
        restored.push({ material, side: material.side });
        material.side = THREE.DoubleSide;
      });
    });
    return restored;
  }

  /**
   * Restores material side values after face picking.
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
   * Ensures mesh world matrices are current before raycasting.
   * @param meshes The meshes that will be tested.
   */
  private prepareMeshesForPicking(meshes: THREE.Mesh[]): void {
    meshes.forEach((mesh) => {
      mesh.updateMatrixWorld(true);
    });
  }

  /**
   * Configures the raycaster from a mouse event and camera.
   * @param event The mouse event.
   * @param camera The camera to cast from.
   * @param renderer The renderer providing canvas bounds.
   */
  private setRayFromEvent(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): void {
    pointerEventToNdc(event, renderer.domElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
  }

  /**
   * Returns the first intersection whose object is in the pickable mesh list.
   * @param intersections Raycast hits sorted by distance.
   * @param meshes The allowed mesh set.
   * @returns The first valid hit, or null.
   */
  private findFirstMeshHit(
    intersections: THREE.Intersection[],
    meshes: THREE.Mesh[]
  ): THREE.Intersection | null {
    const meshSet = new Set(meshes);
    for (const hit of intersections) {
      if (!(hit.object instanceof THREE.Mesh) || !meshSet.has(hit.object)) {
        continue;
      }
      // Solid brush volume helpers must never steal face picks from CSG results.
      if (SolidBrushVisual.shouldSkipFacePick(hit.object)) continue;
      if (hit.faceIndex === undefined || hit.faceIndex === null) continue;
      return hit;
    }
    return null;
  }

  /**
   * Extracts the triangle index from a raycast intersection.
   * @param intersection The Three.js intersection result.
   * @returns The face index, defaulting to 0 if unavailable.
   */
  private extractFaceIndex(intersection: THREE.Intersection): number {
    if (intersection.faceIndex !== undefined && intersection.faceIndex !== null) {
      return intersection.faceIndex;
    }
    return 0;
  }

  /**
   * Disposes internal Three.js resources.
   */
  dispose(): void {
    this.raycaster.ray.origin.set(0, 0, 0);
    this.raycaster.ray.direction.set(0, 0, 0);
  }
}
