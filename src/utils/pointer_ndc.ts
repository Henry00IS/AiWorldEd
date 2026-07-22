import * as THREE from 'three';

/**
 * Converts a pointer event position into normalized device coordinates
 * relative to a DOM element (typically a WebGL canvas).
 * @param event The mouse or pointer event providing client coordinates.
 * @param element The element whose bounds define the NDC origin and scale.
 * @param target Optional Vector2 to write into; a new one is created when omitted.
 * @returns NDC coordinates in the range approximately [-1, 1] for both axes.
 */
export function pointerEventToNdc(
  event: MouseEvent,
  element: HTMLElement,
  target: THREE.Vector2 = new THREE.Vector2()
): THREE.Vector2 {
  const rect = element.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const ndcX = ((event.clientX - rect.left) / width) * 2 - 1;
  const ndcY = -((event.clientY - rect.top) / height) * 2 + 1;
  return target.set(ndcX, ndcY);
}
