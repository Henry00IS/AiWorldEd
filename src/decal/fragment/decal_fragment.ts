/**
 * Decal triangles cut from one brush's surfaces, in model space, three vertices
 * per triangle.
 */
export interface DecalFragment {
  /** Model-space positions, nine floats per triangle. */
  positions: Float32Array;
  /** Unit model-space normals matching the positions. */
  normals: Float32Array;
  /** Image coordinates, six floats per triangle. */
  uvs: Float32Array;
  /** Number of triangles. */
  triangleCount: number;
}

/**
 * Returns whether two optional fragments hold identical triangles.
 *
 * @param first First fragment, or null or undefined for none.
 * @param second Second fragment, or null or undefined for none.
 * @returns True when both are absent or every array matches exactly.
 */
export function decalFragmentsEqual(
  first: DecalFragment | null | undefined,
  second: DecalFragment | null | undefined,
): boolean {
  if (!first || !second) return !first && !second;
  if (first.triangleCount !== second.triangleCount) return false;
  return (
    decalFloatArraysEqual(first.positions, second.positions) &&
    decalFloatArraysEqual(first.normals, second.normals) &&
    decalFloatArraysEqual(first.uvs, second.uvs)
  );
}

/**
 * Returns whether two float arrays hold the same values.
 *
 * @param first First array.
 * @param second Second array.
 * @returns True when lengths and every value match.
 */
function decalFloatArraysEqual(first: Float32Array, second: Float32Array): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}
