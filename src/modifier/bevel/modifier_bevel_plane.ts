import { Vector3 } from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';

/**
 * Builds an outward chamfer plane that trims `distance` along each adjacent
 * face.
 *
 * @param edgePoint A point on the original edge.
 * @param normalA Outward unit normal of the first face.
 * @param normalB Outward unit normal of the second face.
 * @param distance Distance along each face from the edge.
 * @returns Clip plane, or null when the edge is too flat to chamfer.
 */
export function modifierBevelPlaneForEdge(
  edgePoint: Vector3,
  normalA: Vector3,
  normalB: Vector3,
  distance: number,
): SolidPlane | null {
  const bisector = new Vector3().addVectors(normalA, normalB);
  if (bisector.lengthSq() < 1e-8) return null;
  bisector.normalize();
  const inset = distance * modifierBevelHalfAngleSine(normalA, normalB);
  if (inset < 1e-6) return null;
  return new SolidPlane(bisector, inset - bisector.dot(edgePoint));
}

/**
 * Returns sin(phi/2) for the angle between two unit normals.
 *
 * @param normalA First unit normal.
 * @param normalB Second unit normal.
 * @returns Sine of half the angle.
 */
function modifierBevelHalfAngleSine(normalA: Vector3, normalB: Vector3): number {
  return Math.sqrt(Math.max(0, (1 - normalA.dot(normalB)) * 0.5));
}
