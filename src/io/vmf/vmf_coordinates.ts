import * as THREE from 'three';
import { VmfVector3 } from './vmf_types.js';

/**
 * Source hammer units (inches) to editor meters.
 * Matches common Source importers: 32 units = 1 meter.
 */
export const VMF_INCHES_TO_METERS = 1 / 32;

/**
 * Converts a Source Engine Z-up point into Three.js Y-up space.
 * Source (x, y, z) maps to Three (x, z, y); values stay in inches until scaled.
 * @param source Source-space vector.
 * @returns Three-space vector in inches.
 */
export function swizzleSourceToThree(source: VmfVector3): THREE.Vector3 {
  return new THREE.Vector3(source.x, source.z, source.y);
}

/**
 * Converts and scales a Source point into editor meters (Y-up).
 * @param source Source-space vector in inches.
 * @param unitScale Inches-to-meters factor (default 1/32).
 * @returns Three-space point in meters.
 */
export function sourcePointToEditorMeters(
  source: VmfVector3,
  unitScale: number = VMF_INCHES_TO_METERS
): THREE.Vector3 {
  return swizzleSourceToThree(source).multiplyScalar(unitScale);
}

/**
 * Swizzles a free Source direction (normals, UV axes) into Three Y-up.
 * Does not apply unit scale (directions stay unit-length when source was).
 * @param source Source-space direction.
 * @returns Three-space direction.
 */
export function swizzleSourceDirectionToThree(source: VmfVector3): THREE.Vector3 {
  return new THREE.Vector3(source.x, source.z, source.y);
}

/**
 * Swizzles a THREE direction that still uses Source axis order.
 * @param x Source X component.
 * @param y Source Y component.
 * @param z Source Z component.
 * @returns Three-space vector (x, z, y).
 */
export function swizzleSourceComponentsToThree(
  x: number,
  y: number,
  z: number
): THREE.Vector3 {
  return new THREE.Vector3(x, z, y);
}
