import type * as THREE from 'three';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from './solid_model_keys.js';

/**
 * Returns whether a result triangle source came from a modifier output (a
 * generated copy) rather than from its authored brush. Such triangles carry the
 * authored brush id for picking but must never be edited as that brush.
 *
 * @param source Per-triangle solid source, or undefined.
 * @returns True when the source names a derived brush.
 */
export function solidTriangleSourceIsDerived(source: { derivedId?: unknown } | undefined): boolean {
  return typeof source?.derivedId === 'string';
}

/**
 * Returns whether one triangle of a solid result mesh belongs to a modifier
 * output (a generated copy).
 *
 * @param mesh Candidate solid result mesh.
 * @param triangleIndex Result triangle index.
 * @returns True when that triangle is derived; false for authored or unknown.
 */
export function solidResultTriangleIsDerived(mesh: THREE.Object3D, triangleIndex: number): boolean {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as unknown;
  if (!Array.isArray(sources)) return false;
  return solidTriangleSourceIsDerived(sources[triangleIndex] as { derivedId?: unknown } | undefined);
}
