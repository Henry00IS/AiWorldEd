import * as THREE from 'three';
import { FaceSelectionRaycaster } from '../selection/face_selection_raycaster.js';
import { GridSnap } from '../transform/grid_snap.js';
import { pointerEventToNdc } from '../utils/pointer_ndc.js';

/**
 * Picks world points for clip plane placement from mesh hits or a ground plane.
 */
export class ClipPlanePointPicker {
  private faceRaycaster: FaceSelectionRaycaster;
  private raycaster: THREE.Raycaster;
  private ndc: THREE.Vector2;
  private gridSnap: GridSnap;

  /**
   * Creates a point picker bound to a snap configuration.
   * @param gridSnap Shared grid snap settings.
   */
  constructor(gridSnap: GridSnap) {
    this.faceRaycaster = new FaceSelectionRaycaster();
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.gridSnap = gridSnap;
  }

  /**
   * Picks a world point from a pointer event.
   * Prefers mesh surface hits, then falls back to the XZ ground plane.
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @param meshes Candidate meshes for surface hits.
   * @returns Snapped world point, or null when nothing was hit.
   */
  pickPoint(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    meshes: THREE.Mesh[]
  ): THREE.Vector3 | null {
    const surfaceHit = this.faceRaycaster.pickFace(
      event,
      camera,
      renderer,
      meshes
    );
    if (surfaceHit) {
      return this.snapPoint(surfaceHit.hitPoint);
    }
    const groundHit = this.pickGroundPlane(event, camera, renderer);
    if (!groundHit) return null;
    return this.snapPoint(groundHit);
  }

  /**
   * Intersects the pointer ray with the world XZ plane (y = 0).
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @returns Hit point or null.
   */
  private pickGroundPlane(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): THREE.Vector3 | null {
    camera.updateMatrixWorld(true);
    pointerEventToNdc(event, renderer.domElement, this.ndc);
    this.raycaster.setFromCamera(this.ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(plane, hit);
    return intersected ? hit : null;
  }

  /**
   * Applies grid snap when enabled.
   * @param point World point to snap.
   * @returns Possibly snapped clone.
   */
  private snapPoint(point: THREE.Vector3): THREE.Vector3 {
    const snapped = point.clone();
    this.gridSnap.snapVector3(snapped);
    return snapped;
  }
}
