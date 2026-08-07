import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { getOrBuildFacePickBvh } from '@/selection/pick/mesh_pick_acceleration.js';

/** Result of a face picking operation. */
export interface FacePickResult {
  mesh: THREE.Mesh;
  faceIndex: number;
  hitPoint: THREE.Vector3;
  /** Outward world-space face normal at the hit (unit length). */
  faceNormal: THREE.Vector3;
}

/**
 * Performs triangle-precision raycasting for face picking on meshes. Uses a
 * cached triangle BVH per geometry so large solid results stay interactive.
 * Ignores back-facing triangles. Does not touch gizmo picking.
 */
export class RaycasterFaceSelection {
  private readonly helperRaycaster = new THREE.Raycaster();
  private readonly ndcVector = new THREE.Vector2();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly localOrigin = new THREE.Vector3();
  private readonly localDirection = new THREE.Vector3();
  private readonly inverseMatrix = new THREE.Matrix4();
  private readonly worldNormal = new THREE.Vector3();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly worldBox = new THREE.Box3();
  private readonly boxHitPoint = new THREE.Vector3();
  private readonly worldRay = new THREE.Ray();

  /**
   * Picks a face from a set of meshes at the given mouse position. Returns the
   * closest front-facing face intersection with the triangle index.
   *
   * @param event The mouse event providing click coordinates.
   * @param camera The camera to cast the ray from.
   * @param pickElement The element used to convert pointer coordinates to NDC.
   * @param meshes The meshes to test for intersection.
   * @returns A face pick result, or null if no front-facing face was hit.
   */
  pickFace(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    meshes: THREE.Mesh[],
  ): FacePickResult | null {
    if (meshes.length === 0) return null;
    camera.updateMatrixWorld(true);
    this.setRayFromEvent(event, camera, pickElement);
    let bestMesh: THREE.Mesh | null = null;
    let bestFaceIndex = -1;
    let bestDistance = Infinity;
    let bestPoint: THREE.Vector3 | null = null;
    let bestNormal: THREE.Vector3 | null = null;
    for (const mesh of meshes) {
      if (SolidBrushVisual.shouldSkipFacePick(mesh)) continue;
      if (!mesh.visible) continue;
      const candidate = this.pickFrontFaceOnMesh(mesh, bestDistance);
      if (!candidate) continue;
      bestMesh = mesh;
      bestFaceIndex = candidate.faceIndex;
      bestDistance = candidate.distance;
      bestPoint = candidate.point;
      bestNormal = candidate.worldNormal;
    }
    if (!bestMesh || !bestPoint || !bestNormal || bestFaceIndex < 0) return null;
    return {
      mesh: bestMesh,
      faceIndex: bestFaceIndex,
      hitPoint: bestPoint,
      faceNormal: bestNormal,
    };
  }

  /**
   * Configures the world-space pick ray from a pointer event and camera.
   *
   * @param event The mouse event providing pointer coordinates.
   * @param camera The camera to cast from.
   * @param pickElement The element used to convert pointer coordinates to NDC.
   */
  private setRayFromEvent(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): void {
    pointerEventToNdc(event, pickElement, this.ndcVector);
    this.helperRaycaster.setFromCamera(this.ndcVector, camera);
    this.rayOrigin.copy(this.helperRaycaster.ray.origin);
    this.rayDirection.copy(this.helperRaycaster.ray.direction);
  }

  /**
   * Picks the closest front-facing triangle on one mesh closer than
   * maxDistance.
   *
   * @param mesh Candidate mesh.
   * @param maxDistance Current closest hit distance in world units.
   * @returns Local hit converted to world space, or null.
   */
  private pickFrontFaceOnMesh(
    mesh: THREE.Mesh,
    maxDistance: number,
  ): { faceIndex: number; distance: number; point: THREE.Vector3; worldNormal: THREE.Vector3 } | null {
    mesh.updateMatrixWorld(true);
    if (!this.rayIntersectsWorldBounds(mesh, maxDistance)) {
      return null;
    }
    const bvh = getOrBuildFacePickBvh(mesh);
    if (!bvh) return null;
    this.inverseMatrix.copy(mesh.matrixWorld).invert();
    this.localOrigin.copy(this.rayOrigin).applyMatrix4(this.inverseMatrix);
    this.localDirection.copy(this.rayDirection).transformDirection(this.inverseMatrix).normalize();
    const localMaxDistance = this.estimateLocalMaxDistance(mesh, maxDistance);
    const hit = bvh.raycastFrontFacing(this.localOrigin, this.localDirection, localMaxDistance);
    if (!hit) return null;
    const worldPoint = hit.point.applyMatrix4(mesh.matrixWorld);
    const worldDistance = worldPoint.distanceTo(this.rayOrigin);
    if (worldDistance >= maxDistance) return null;
    this.normalMatrix.getNormalMatrix(mesh.matrixWorld);
    this.worldNormal.copy(hit.localNormal).applyMatrix3(this.normalMatrix).normalize();
    if (this.worldNormal.dot(this.rayDirection) >= 0) return null;
    return {
      faceIndex: hit.faceIndex,
      distance: worldDistance,
      point: worldPoint,
      worldNormal: this.worldNormal.clone(),
    };
  }

  /**
   * Cheap world-AABB rejection before transforming the ray into local space.
   *
   * @param mesh Candidate mesh.
   * @param maxDistance Current closest hit distance.
   * @returns True when the ray may still hit the mesh sooner than maxDistance.
   */
  private rayIntersectsWorldBounds(mesh: THREE.Mesh, maxDistance: number): boolean {
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const box = geometry.boundingBox;
    if (!box) return true;
    this.worldBox.copy(box).applyMatrix4(mesh.matrixWorld);
    this.worldRay.origin.copy(this.rayOrigin);
    this.worldRay.direction.copy(this.rayDirection);
    if (!this.worldRay.intersectBox(this.worldBox, this.boxHitPoint)) return false;
    return this.rayOrigin.distanceTo(this.boxHitPoint) < maxDistance;
  }

  /**
   * Converts a world-space distance cap into a conservative local-space cap.
   *
   * @param mesh Mesh being tested.
   * @param maxDistance World-space max distance.
   * @returns Local-space max distance for BVH traversal.
   */
  private estimateLocalMaxDistance(mesh: THREE.Mesh, maxDistance: number): number {
    if (!Number.isFinite(maxDistance)) return Infinity;
    const scale = mesh.matrixWorld.getMaxScaleOnAxis();
    if (scale <= 1e-12) return maxDistance;
    return maxDistance / scale + 1e-4;
  }

  /** Disposes internal resources (no GPU objects owned). */
  dispose(): void {}
}
