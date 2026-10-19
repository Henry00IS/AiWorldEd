import { Vector3 } from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';

/**
 * Builds the plane through an edge and the halfway station of its profile.
 *
 * @param girder Authored edge in brush-local space.
 * @returns Plane, or null when the profile has no width.
 */
export function modifierBevelCenterPlane(girder: ModifierBevelGirder | undefined): SolidPlane | null {
  if (!girder) return null;
  const normal = modifierBevelCenterNormal(girder);
  if (normal.lengthSq() < 1e-12) return null;
  return new SolidPlane(normal, -normal.dot(girder.start));
}

/**
 * Returns the normal of the plane that splits a profile in half.
 *
 * @param girder Authored edge.
 * @returns Unnormalized normal. Zero when the walls are parallel.
 */
function modifierBevelCenterNormal(girder: ModifierBevelGirder): Vector3 {
  const first = modifierBevelWallNormal(girder.direction, girder.contactA, girder.contactB);
  const second = modifierBevelWallNormal(girder.direction, girder.contactB, girder.contactA);
  return first.sub(second);
}

/**
 * Returns the outward normal of the wall a contact direction lies in.
 *
 * @param direction Unit edge direction.
 * @param contact Direction from the edge along the wall.
 * @param other Direction from the edge along the other wall.
 * @returns Unit normal.
 */
export function modifierBevelWallNormal(direction: Vector3, contact: Vector3, other: Vector3): Vector3 {
  const normal = new Vector3().crossVectors(direction, contact);
  if (normal.dot(other) > 0) normal.negate();
  if (normal.lengthSq() < 1e-12) return normal;
  return normal.normalize();
}
