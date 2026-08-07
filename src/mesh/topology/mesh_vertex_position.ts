import { MESH_VERTEX_POSITION_STRIDE } from './mesh_topology_constants.js';

/**
 * Reads one vertex position from a packed xyz float buffer into an output
 * triple.
 *
 * @param positions Packed vertex positions.
 * @param vertexIndex Vertex index.
 * @param outXyz Length-3 array or typed view receiving x, y, z.
 */
export function meshVertexPositionRead(
  positions: Float32Array,
  vertexIndex: number,
  outXyz: { 0: number; 1: number; 2: number; length: number },
): void {
  const base = vertexIndex * MESH_VERTEX_POSITION_STRIDE;
  outXyz[0] = positions[base]!;
  outXyz[1] = positions[base + 1]!;
  outXyz[2] = positions[base + 2]!;
}

/**
 * Returns the number of vertices implied by a packed position buffer.
 *
 * @param positions Packed vertex positions.
 * @returns Vertex count.
 */
export function meshVertexCountFromPositions(positions: Float32Array): number {
  return Math.floor(positions.length / MESH_VERTEX_POSITION_STRIDE);
}

/**
 * Clones a packed vertex position buffer.
 *
 * @param positions Source positions.
 * @returns Independent copy.
 */
export function meshVertexPositionsClone(positions: Float32Array): Float32Array {
  return new Float32Array(positions);
}
