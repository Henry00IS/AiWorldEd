import { Box3, Vector3, type Object3D } from 'three';
import {
  modifierStackFrame,
  modifierStackVolumeBox,
  modifierStackVolumeLocalBox,
} from '@/modifier/stack/evaluate/modifier_stack_frame.js';

/**
 * Returns the box a mirror plane is placed in, in the placement frame. With
 * world axes it is the world-aligned bounds of the volume around its position,
 * so the centre plane runs through the volume centre and a side plane touches
 * the volume's outermost point along the world axis.
 *
 * @param volume Modifier volume.
 * @param space Mirror 'space' parameter.
 * @returns Box in the placement frame.
 */
export function modifierStackMirrorBox(volume: Object3D, space: unknown): Box3 {
  if (space !== 'world') return modifierStackVolumeBox(volume);
  const local = modifierStackVolumeLocalBox(volume);
  if (local.isEmpty()) return new Box3();
  const toFrame = modifierStackFrame(volume, 'world').invert().multiply(volume.matrixWorld);
  return local.applyMatrix4(toFrame);
}

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
 * plane keeps the volume's inside; the centre plane keeps the positive side.
 * Flip swaps it.
 *
 * @param parameters Normalized mirror parameters.
 * @returns 1 for the positive side, -1 for the negative side.
 */
export function modifierStackMirrorKeptSign(parameters: Record<string, unknown>): 1 | -1 {
  const inside = parameters['plane'] === 'max' ? -1 : 1;
  return parameters['flip'] === true ? (-inside as 1 | -1) : inside;
}
