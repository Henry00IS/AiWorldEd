import * as THREE from 'three';
import { pointerEventToNdc } from '../utils/pointer_ndc.js';
import { CLIP_MARKER_PICK_PIXELS } from './clip_plane_marker_style.js';
import { GridSnap } from '../transform/grid_snap.js';

/**
 * Screen-space picking and view-plane dragging for clip placement points.
 */
export class ClipPlanePointDrag {
  private raycaster: THREE.Raycaster;
  private ndc: THREE.Vector2;
  private viewPlane: THREE.Plane;
  private scratchDirection: THREE.Vector3;
  private scratchHit: THREE.Vector3;
  private gridSnap: GridSnap;

  /**
   * Creates a drag helper bound to snap settings.
   * @param gridSnap Shared grid snap configuration.
   */
  constructor(gridSnap: GridSnap) {
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.viewPlane = new THREE.Plane();
    this.scratchDirection = new THREE.Vector3();
    this.scratchHit = new THREE.Vector3();
    this.gridSnap = gridSnap;
  }

  /**
   * Finds the placement point closest to the pointer within pick radius.
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @param points Current placement points.
   * @returns Point index, or null when none is near the cursor.
   */
  pickMarkerIndex(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    points: THREE.Vector3[]
  ): number | null {
    if (points.length === 0) return null;
    const element = renderer.domElement;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    let bestIndex: number | null = null;
    let bestDistance = CLIP_MARKER_PICK_PIXELS;
    points.forEach((point, index) => {
      const distance = this.screenDistancePixels(
        point,
        camera,
        rect,
        event.clientX,
        event.clientY
      );
      if (distance === null || distance > bestDistance) return;
      bestDistance = distance;
      bestIndex = index;
    });
    return bestIndex;
  }

  /**
   * Builds a view-aligned drag plane through the given world point.
   * @param point World point under the pointer.
   * @param camera Viewport camera.
   * @returns Plane for ray intersections during drag.
   */
  createDragPlane(point: THREE.Vector3, camera: THREE.Camera): THREE.Plane {
    camera.getWorldDirection(this.scratchDirection);
    this.viewPlane.setFromNormalAndCoplanarPoint(
      this.scratchDirection,
      point
    );
    return this.viewPlane.clone();
  }

  /**
   * Projects the pointer onto a drag plane and applies grid snap.
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @param dragPlane Plane established at drag start.
   * @returns Snapped world hit, or null when the ray misses the plane.
   */
  projectOntoDragPlane(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    dragPlane: THREE.Plane
  ): THREE.Vector3 | null {
    camera.updateMatrixWorld(true);
    pointerEventToNdc(event, renderer.domElement, this.ndc);
    this.raycaster.setFromCamera(this.ndc, camera);
    const hit = this.raycaster.ray.intersectPlane(dragPlane, this.scratchHit);
    if (!hit) return null;
    const snapped = hit.clone();
    this.gridSnap.snapVector3(snapped);
    return snapped;
  }

  /**
   * Measures distance in CSS pixels between a world point and the pointer.
   * @param point World point.
   * @param camera Viewport camera.
   * @param rect Canvas bounding client rect.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns Pixel distance, or null when the point is behind the camera.
   */
  private screenDistancePixels(
    point: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
    clientX: number,
    clientY: number
  ): number | null {
    const projected = point.clone().project(camera);
    if (projected.z < -1 || projected.z > 1) return null;
    const screenX = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
    const screenY = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
    const deltaX = screenX - clientX;
    const deltaY = screenY - clientY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }
}
