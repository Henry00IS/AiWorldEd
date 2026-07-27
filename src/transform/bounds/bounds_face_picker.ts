import * as THREE from 'three';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../../types/bounds_face.js';
import { pointerEventToNdc } from '../../utils/pointer_ndc.js';
import { isGizmoWantedVisible } from '../gizmo/gizmo_viewport_visibility.js';

/** Result of picking a bounds face for plane-constrained translation or resize. */
export interface BoundsFacePickResult {
  face: BoundsFace;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Raycasts against bounds face pick meshes in a gizmo group. Used by Bounds
 * mode for face-plane move, rim resize, and hover highlight.
 */
export class BoundsFacePicker {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;
  private scratchWorldPosition: THREE.Vector3;
  private scratchProjected: THREE.Vector3;
  private scratchNormal: THREE.Vector3;
  private scratchViewDirection: THREE.Vector3;
  private scratchQuaternion: THREE.Quaternion;

  /** Creates a new bounds face picker. */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
    this.scratchWorldPosition = new THREE.Vector3();
    this.scratchProjected = new THREE.Vector3();
    this.scratchNormal = new THREE.Vector3();
    this.scratchViewDirection = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
  }

  /**
   * Picks the closest bounds face under the pointer via raycast.
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param gizmoGroup Viewport gizmo group containing face pick meshes.
   * @returns Face pick result, or null if none hit.
   */
  pickFace(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    gizmoGroup: THREE.Group,
  ): BoundsFacePickResult | null {
    if (!isGizmoWantedVisible(gizmoGroup)) return null;
    this.prepareRay(event, camera, pickElement, gizmoGroup);
    const pickMeshes = this.collectFacePickMeshes(gizmoGroup);
    if (pickMeshes.length === 0) return null;
    const hits = this.raycaster.intersectObjects(pickMeshes, false);
    return this.buildResultFromHits(hits);
  }

  /**
   * Picks the bounds face nearest the pointer for hover highlight. Prefers a
   * direct raycast hit; otherwise chooses the front-facing face whose center is
   * closest to the cursor in screen space.
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param gizmoGroup Viewport gizmo group containing face pick meshes.
   * @returns Face pick result, or null when no faces are available.
   */
  pickClosestFace(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    gizmoGroup: THREE.Group,
  ): BoundsFacePickResult | null {
    const rayHit = this.pickFace(event, camera, pickElement, gizmoGroup);
    if (rayHit) return rayHit;
    return this.pickNearestFrontFaceByScreen(event, camera, pickElement, gizmoGroup);
  }

  /**
   * Collects visible face pick meshes from the gizmo hierarchy.
   *
   * @param group The gizmo group.
   * @returns Pickable face meshes.
   */
  private collectFacePickMeshes(group: THREE.Group): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.visible) return;
      if (child.userData['isBoundsFacePick'] !== true) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Prepares the raycaster from the pointer and updates world matrices.
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement DOM pick target.
   * @param gizmoGroup Gizmo group to update.
   */
  private prepareRay(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement, gizmoGroup: THREE.Group): void {
    camera.updateMatrixWorld(true);
    gizmoGroup.updateMatrixWorld(true);
    pointerEventToNdc(event, pickElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
  }

  /**
   * Builds a pick result from sorted raycast hits.
   *
   * @param hits Intersection list sorted by distance.
   * @returns Face pick result or null.
   */
  private buildResultFromHits(hits: THREE.Intersection[]): BoundsFacePickResult | null {
    for (const hit of hits) {
      const face = hit.object.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
      if (!face) continue;
      return {
        face,
        point: hit.point.clone(),
        normal: this.extractWorldNormal(hit),
      };
    }
    return null;
  }

  /**
   * Picks the front-facing face whose projected center is nearest the cursor.
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement DOM pick target.
   * @param gizmoGroup Gizmo group with face pick meshes.
   * @returns Face pick result or null.
   */
  private pickNearestFrontFaceByScreen(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    gizmoGroup: THREE.Group,
  ): BoundsFacePickResult | null {
    if (!isGizmoWantedVisible(gizmoGroup)) return null;
    this.prepareRay(event, camera, pickElement, gizmoGroup);
    const meshes = this.collectFacePickMeshes(gizmoGroup);
    let bestMesh: THREE.Mesh | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const mesh of meshes) {
      const distance = this.screenDistanceSquaredToMesh(mesh, camera);
      if (distance === null || distance >= bestDistance) continue;
      bestDistance = distance;
      bestMesh = mesh;
    }
    return bestMesh ? this.buildResultFromMesh(bestMesh) : null;
  }

  /**
   * Returns screen-space distance squared from the pointer NDC to a face mesh
   * center when the face faces the camera, otherwise null.
   *
   * @param mesh Face pick mesh.
   * @param camera Viewport camera.
   * @returns Distance squared in NDC units, or null when back-facing.
   */
  private screenDistanceSquaredToMesh(mesh: THREE.Mesh, camera: THREE.Camera): number | null {
    mesh.getWorldPosition(this.scratchWorldPosition);
    this.writeMeshWorldNormal(mesh, this.scratchNormal);
    this.scratchViewDirection.copy(camera.position).sub(this.scratchWorldPosition).normalize();
    if (this.scratchNormal.dot(this.scratchViewDirection) <= 0.05) return null;
    this.scratchProjected.copy(this.scratchWorldPosition).project(camera);
    if (Math.abs(this.scratchProjected.z) > 1) return null;
    const deltaX = this.scratchProjected.x - this.ndcVector.x;
    const deltaY = this.scratchProjected.y - this.ndcVector.y;
    return deltaX * deltaX + deltaY * deltaY;
  }

  /**
   * Builds a pick result from a face mesh world pose.
   *
   * @param mesh Face pick mesh.
   * @returns Face pick result, or null when userData is invalid.
   */
  private buildResultFromMesh(mesh: THREE.Mesh): BoundsFacePickResult | null {
    const face = mesh.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    if (!face) return null;
    mesh.getWorldPosition(this.scratchWorldPosition);
    this.writeMeshWorldNormal(mesh, this.scratchNormal);
    return {
      face,
      point: this.scratchWorldPosition.clone(),
      normal: this.scratchNormal.clone(),
    };
  }

  /**
   * Writes the world-space outward normal of a plane face pick mesh.
   *
   * @param mesh Face pick mesh oriented so local +Z is outward.
   * @param target Vector written with the normalized world normal.
   */
  private writeMeshWorldNormal(mesh: THREE.Mesh, target: THREE.Vector3): void {
    mesh.getWorldQuaternion(this.scratchQuaternion);
    target.set(0, 0, 1).applyQuaternion(this.scratchQuaternion).normalize();
  }

  /**
   * Extracts a world-space face normal from an intersection.
   *
   * @param hit The raycast hit.
   * @returns Normalized world normal.
   */
  private extractWorldNormal(hit: THREE.Intersection): THREE.Vector3 {
    if (hit.face) {
      const normal = hit.face.normal.clone();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      normal.applyMatrix3(normalMatrix).normalize();
      return normal;
    }
    return new THREE.Vector3(0, 1, 0);
  }

  /** Disposes internal resources. */
  dispose(): void {
    this.ndcVector.set(0, 0);
  }
}
