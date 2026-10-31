import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';

/**
 * Builds a world ray through a client point on a viewport.
 *
 * @param camera Viewport camera.
 * @param pickElement Element that owns the client coordinates.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns Ray origin and direction.
 */
export function alignPointerRay(
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
): { origin: THREE.Vector3; direction: THREE.Vector3 } {
  const event = new MouseEvent('mousedown', { clientX, clientY, bubbles: true });
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointerEventToNdc(event, pickElement), camera);
  return { origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() };
}
