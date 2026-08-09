import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';

const scratchNdc = new THREE.Vector2();
const scratchRaycaster = new THREE.Raycaster();
const scratchHit = new THREE.Vector3();

/**
 * Builds a world ray from client coordinates against a camera and pick element.
 *
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param camera Camera to unproject from.
 * @param pickElement DOM element for NDC conversion.
 * @returns World-space ray.
 */
export function buildWorldRayFromClientPoint(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  pickElement: HTMLElement,
): THREE.Ray {
  const synthetic = { clientX, clientY } as MouseEvent;
  pointerEventToNdc(synthetic, pickElement, scratchNdc);
  camera.updateMatrixWorld(true);
  scratchRaycaster.setFromCamera(scratchNdc, camera);
  return scratchRaycaster.ray.clone();
}

/**
 * Intersects a world ray with a plane, writing into target when provided.
 *
 * @param ray World ray.
 * @param plane World plane.
 * @param target Optional write target.
 * @returns Intersection point, or null when parallel / behind.
 */
export function intersectRayWithPlane(
  ray: THREE.Ray,
  plane: THREE.Plane,
  target: THREE.Vector3 = scratchHit,
): THREE.Vector3 | null {
  const hit = ray.intersectPlane(plane, target);
  if (!hit) {
    return null;
  }
  return hit.clone();
}

/**
 * Intersects client coordinates with a world plane.
 *
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param camera Camera for unprojection.
 * @param pickElement DOM pick element.
 * @param plane World plane.
 * @returns World intersection, or null.
 */
export function intersectClientPointWithWorldPlane(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  plane: THREE.Plane,
): THREE.Vector3 | null {
  const ray = buildWorldRayFromClientPoint(clientX, clientY, camera, pickElement);
  return intersectRayWithPlane(ray, plane);
}
