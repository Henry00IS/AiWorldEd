import * as THREE from 'three';

/** Scratch storage turning one coordinate into its two 32-bit halves. */
const SEAM_FINGERPRINT_FLOAT = new Float64Array(1);
/** Integer view of {@link SEAM_FINGERPRINT_FLOAT}. */
const SEAM_FINGERPRINT_WORDS = new Int32Array(SEAM_FINGERPRINT_FLOAT.buffer);

/**
 * Hashes the exact vertex coordinates of an outline, so an unchanged polygon
 * can be recognised in a recompiled brush without comparing every polygon.
 *
 * @param vertices Polygon vertices.
 * @returns 32-bit hash of every coordinate bit pattern in order.
 */
export function seamPolygonFingerprint(vertices: readonly THREE.Vector3[]): number {
  let hash = Math.imul(vertices.length, 0x9e3779b1);
  for (const vertex of vertices) {
    hash = seamMixCoordinate(hash, vertex.x);
    hash = seamMixCoordinate(hash, vertex.y);
    hash = seamMixCoordinate(hash, vertex.z);
  }
  return hash | 0;
}

/**
 * Whether two outlines have identical vertices in the same order.
 *
 * @param left First outline.
 * @param right Second outline.
 * @returns True when equal coordinate for coordinate.
 */
export function seamVerticesEqual(left: readonly THREE.Vector3[], right: readonly THREE.Vector3[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    const a = left[index]!;
    const b = right[index]!;
    if (a.x !== b.x || a.y !== b.y || a.z !== b.z) return false;
  }
  return true;
}

/**
 * Mixes one coordinate's bit pattern into a running hash.
 *
 * @param hash Running hash.
 * @param value Coordinate.
 * @returns Updated hash.
 */
function seamMixCoordinate(hash: number, value: number): number {
  SEAM_FINGERPRINT_FLOAT[0] = value + 0;
  hash = Math.imul(hash ^ SEAM_FINGERPRINT_WORDS[0]!, 0x85ebca77);
  hash = Math.imul(hash ^ SEAM_FINGERPRINT_WORDS[1]!, 0xc2b2ae3d);
  return hash ^ (hash >>> 15);
}
