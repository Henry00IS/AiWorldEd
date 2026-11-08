import { Vector3, type Box3 } from 'three';

/**
 * Returns the mirror plane position along its axis, in the volume frame.
 *
 * @param axis Plane normal.
 * @param parameters Normalized mirror parameters.
 * @param box Volume box in its own frame.
 * @returns Signed distance from the volume origin.
 */
export function modifierStackMirrorDistance(axis: Vector3, parameters: Record<string, unknown>, box: Box3): number {
  const offset = Number(parameters['planeOffset']);
  const plane = parameters['plane'];
  if (box.isEmpty()) return offset;
  if (plane === 'min') return offset + box.min.dot(axis);
  if (plane === 'max') return offset + box.max.dot(axis);
  return offset + box.getCenter(new Vector3()).dot(axis);
}

/**
 * Returns which side of the mirror plane Bisect keeps, along the axis. A side
 * plane keeps the volume's inside; the centre plane keeps the positive side,
 * like Blender. Flip swaps it.
 *
 * @param parameters Normalized mirror parameters.
 * @returns 1 for the positive side, -1 for the negative side.
 */
export function modifierStackMirrorKeptSign(parameters: Record<string, unknown>): 1 | -1 {
  const inside = parameters['plane'] === 'max' ? -1 : 1;
  return parameters['flip'] === true ? (-inside as 1 | -1) : inside;
}
