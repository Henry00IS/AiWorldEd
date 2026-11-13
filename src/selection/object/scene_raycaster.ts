import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';
import { getOrBuildFacePickBvh } from '@/selection/pick/mesh_pick_acceleration.js';

/**
 * Shared raycasting utility for click-to-select across all viewports. Uses a
 * sphere/AABB prefilter and the cached triangle BVH (same acceleration as face
 * pick) so dense terrain and complex meshes stay interactive.
 */
export class SceneRaycaster {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;
  private readonly scratchSphere = new THREE.Sphere();
  private readonly scratchWorldBox = new THREE.Box3();
  private readonly scratchBoxHit = new THREE.Vector3();
  private readonly scratchInverse = new THREE.Matrix4();
  private readonly scratchLocalOrigin = new THREE.Vector3();
  private readonly scratchLocalDirection = new THREE.Vector3();
  private readonly candidateMeshes: THREE.Mesh[] = [];

  /** Creates a new shared raycaster instance for click-to-select operations. */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
  }

  /**
   * Casts a ray from the camera through the mouse position against selectable
   * objects.
   *
   * @param camera The camera to cast from.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param event The mouse event providing the click position.
   * @param selectableObjects The array of meshes to test against.
   * @returns The first intersected mesh, or null if no intersection.
   */
  cast(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectableObjects: THREE.Mesh[],
  ): THREE.Mesh | null {
    const hits = this.castAll(camera, pickElement, event, selectableObjects);
    return hits.length > 0 ? hits[0]! : null;
  }

  /**
   * Casts a ray and returns every intersected mesh near-to-far (with
   * duplicates). Callers that need click-through should dedupe via
   * SelectionClickThrough.
   *
   * @param camera The camera to cast from.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param event The mouse event providing the click position.
   * @param selectableObjects The array of meshes to test against.
   * @returns Hit meshes ordered by ray distance (closest first).
   */
  castAll(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectableObjects: THREE.Mesh[],
  ): THREE.Mesh[] {
    return this.allMeshHits(this.castIntersections(camera, pickElement, event, selectableObjects));
  }

  /**
   * Returns raycast intersection records ordered near-to-far for click-through.
   *
   * @param camera The camera to cast from.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param event The mouse event providing the click position.
   * @param selectableObjects The array of meshes to test against.
   * @returns Intersection records (distance-sorted).
   */
  castIntersections(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectableObjects: THREE.Mesh[],
  ): THREE.Intersection[] {
    if (selectableObjects.length === 0) return [];
    camera.updateMatrixWorld(false);
    pointerEventToNdc(event, pickElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
    return this.castRay(this.raycaster.ray, selectableObjects);
  }

  /**
   * Casts a world-space ray against meshes and returns the hits near-to-far.
   *
   * @param ray World-space ray.
   * @param meshes Meshes to test.
   * @returns Intersection records (distance-sorted).
   */
  castRay(ray: THREE.Ray, meshes: THREE.Mesh[]): THREE.Intersection[] {
    this.raycaster.ray.copy(ray);
    this.collectSphereCandidates(meshes);
    if (this.candidateMeshes.length === 0) return [];
    const intersections: THREE.Intersection[] = [];
    for (const mesh of this.candidateMeshes) {
      const hit = this.pickMeshWithBvh(mesh);
      if (hit) {
        intersections.push(hit);
      }
    }
    intersections.sort((left, right) => left.distance - right.distance);
    return intersections;
  }

  /**
   * Collects meshes whose world bounding spheres may intersect the pick ray.
   *
   * @param meshes Selectable meshes.
   */
  private collectSphereCandidates(meshes: THREE.Mesh[]): void {
    this.candidateMeshes.length = 0;
    const ray = this.raycaster.ray;
    for (const mesh of meshes) {
      if (!mesh.visible) continue;
      mesh.updateMatrixWorld(false);
      if (!this.rayIntersectsMeshWorldSphere(mesh, ray)) continue;
      this.candidateMeshes.push(mesh);
    }
  }

  /**
   * Tests the pick ray against a mesh world-space bounding sphere.
   *
   * @param mesh Candidate mesh.
   * @param ray World-space pick ray.
   * @returns True when the ray may hit the mesh.
   */
  private rayIntersectsMeshWorldSphere(mesh: THREE.Mesh, ray: THREE.Ray): boolean {
    const geometry = mesh.geometry;
    if (!geometry) return false;
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }
    const localSphere = geometry.boundingSphere;
    if (!localSphere) return true;
    this.scratchSphere.copy(localSphere);
    this.scratchSphere.applyMatrix4(mesh.matrixWorld);
    return ray.intersectsSphere(this.scratchSphere);
  }

  /**
   * Picks the closest double-sided triangle on one mesh via the cached BVH.
   *
   * @param mesh Candidate mesh.
   * @returns Three.js-style intersection, or null.
   */
  private pickMeshWithBvh(mesh: THREE.Mesh): THREE.Intersection | null {
    if (!this.rayIntersectsMeshWorldBox(mesh)) {
      return null;
    }
    const bvh = getOrBuildFacePickBvh(mesh);
    if (!bvh) {
      return null;
    }
    this.scratchInverse.copy(mesh.matrixWorld).invert();
    this.scratchLocalOrigin.copy(this.raycaster.ray.origin).applyMatrix4(this.scratchInverse);
    this.scratchLocalDirection.copy(this.raycaster.ray.direction).transformDirection(this.scratchInverse).normalize();
    const hit = bvh.raycastDoubleSided(this.scratchLocalOrigin, this.scratchLocalDirection, Infinity);
    if (!hit) {
      return null;
    }
    const worldPoint = hit.point.clone().applyMatrix4(mesh.matrixWorld);
    const worldDistance = this.raycaster.ray.origin.distanceTo(worldPoint);
    return {
      distance: worldDistance,
      point: worldPoint,
      object: mesh,
      faceIndex: hit.faceIndex,
    } as THREE.Intersection;
  }

  /**
   * Cheap world AABB rejection before local BVH transform.
   *
   * @param mesh Candidate mesh.
   * @returns True when the ray may hit the mesh AABB.
   */
  private rayIntersectsMeshWorldBox(mesh: THREE.Mesh): boolean {
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const box = geometry.boundingBox;
    if (!box) {
      return true;
    }
    this.scratchWorldBox.copy(box).applyMatrix4(mesh.matrixWorld);
    return this.raycaster.ray.intersectBox(this.scratchWorldBox, this.scratchBoxHit) !== null;
  }

  /**
   * Collects every mesh object from a sorted intersection list.
   *
   * @param intersections Raycast hits sorted by distance.
   * @returns Hit meshes in the same order.
   */
  private allMeshHits(intersections: THREE.Intersection[]): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const hit of intersections) {
      if (hit.object instanceof THREE.Mesh) {
        meshes.push(hit.object);
      }
    }
    return meshes;
  }

  /** Disposes internal Three.js resources. */
  dispose(): void {}
}
