import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { PhysicsShatterInsideSettings } from './physics_shatter_settings.js';

/**
 * Builds the surface of one crack face in modifier frame coordinates. World
 * Aligned lays the texture flat on the face; Box projects it from the frame
 * axis nearest the face normal. Scale is metres per tile. Both faces of a cut
 * project along the same direction, so they get the same UVs and the texture
 * runs straight across the crack.
 *
 * @param normal Outward face normal in the frame.
 * @param inside Crack face texture settings.
 * @param fallbackTextureId Texture used when no Inside Texture is set.
 * @returns Surface whose UV matrix acts on frame coordinates.
 */
export function physicsShatterCrackSurface(
  normal: THREE.Vector3,
  inside: PhysicsShatterInsideSettings,
  fallbackTextureId: string,
): FaceSurfaceDescription {
  const facing = physicsShatterCrackFacing(normal);
  const projected = inside.projection === 'box' ? physicsShatterBoxAxis(facing) : facing;
  const translation = new THREE.Vector2(inside.offsetU, inside.offsetV);
  const scaleU = 1 / Math.max(0.01, inside.scaleU);
  const scaleV = 1 / Math.max(0.01, inside.scaleV);
  return {
    textureId: inside.textureId || fallbackTextureId,
    uv: SurfaceUvMatrix.fromTrs(translation, projected, inside.rotation, scaleU, scaleV),
  };
}

/**
 * Snaps a normal to the frame axis it is closest to, keeping its sign.
 *
 * @param normal Face normal.
 * @returns Signed unit axis.
 */
export function physicsShatterBoxAxis(normal: THREE.Vector3): THREE.Vector3 {
  const absolute = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  const axis = absolute.indexOf(Math.max(...absolute));
  return new THREE.Vector3().setComponent(axis, Math.sign(normal.getComponent(axis)) || 1);
}

/**
 * Turns a face normal so its largest component is positive, which gives the two
 * opposite faces of one cut the same direction.
 *
 * @param normal Face normal.
 * @returns Unit normal, possibly reversed.
 */
export function physicsShatterCrackFacing(normal: THREE.Vector3): THREE.Vector3 {
  const unit = normal.clone().normalize();
  const axis = physicsShatterBoxAxis(unit);
  return axis.x + axis.y + axis.z < 0 ? unit.negate() : unit;
}
