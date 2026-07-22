import * as THREE from 'three';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../types/bounds_face.js';
import { pointerEventToNdc } from '../utils/pointer_ndc.js';

/**
 * Result of picking a bounds face for plane-constrained translation.
 */
export interface BoundsFacePickResult {
  face: BoundsFace;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Raycasts against bounds face pick meshes in a gizmo group.
 * Used by Bounds Move mode to start a face-plane drag.
 */
export class BoundsFacePicker {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;

  /**
   * Creates a new bounds face picker.
   */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
  }

  /**
   * Picks the closest bounds face under the pointer.
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @param gizmoGroup Viewport gizmo group containing face pick meshes.
   * @returns Face pick result, or null if none hit.
   */
  pickFace(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    gizmoGroup: THREE.Group
  ): BoundsFacePickResult | null {
    if (!gizmoGroup.visible) return null;
    camera.updateMatrixWorld(true);
    gizmoGroup.updateMatrixWorld(true);
    pointerEventToNdc(event, renderer.domElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
    const pickMeshes = this.collectFacePickMeshes(gizmoGroup);
    if (pickMeshes.length === 0) return null;
    const hits = this.raycaster.intersectObjects(pickMeshes, false);
    return this.buildResultFromHits(hits);
  }

  /**
   * Collects visible face pick meshes from the gizmo hierarchy.
   * @param group The gizmo group.
   * @returns Pickable face meshes.
   */
  private collectFacePickMeshes(group: THREE.Group): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.visible) return;
      if (child.userData.isBoundsFacePick !== true) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Builds a pick result from sorted raycast hits.
   * @param hits Intersection list sorted by distance.
   * @returns Face pick result or null.
   */
  private buildResultFromHits(
    hits: THREE.Intersection[]
  ): BoundsFacePickResult | null {
    for (const hit of hits) {
      const face = hit.object.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
      if (!face) continue;
      const normal = this.extractWorldNormal(hit);
      return {
        face,
        point: hit.point.clone(),
        normal
      };
    }
    return null;
  }

  /**
   * Extracts a world-space face normal from an intersection.
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

  /**
   * Disposes internal resources.
   */
  dispose(): void {
    this.ndcVector.set(0, 0);
  }
}
