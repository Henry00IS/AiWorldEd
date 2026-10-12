import type { Vector3 } from 'three';

/** Distance at which two brush corners are treated as the same vertex. */
export const SOLID_BRUSH_VERTEX_WELD_EPSILON = 1e-4;

/**
 * Finds a vertex already within the weld distance of a point.
 *
 * @param vertices Existing vertices.
 * @param point Candidate position.
 * @returns Matching index, or null when none is close enough.
 */
export function findSolidBrushWeldedVertexIndex(vertices: readonly Vector3[], point: Vector3): number | null {
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    if (vertex && vertex.distanceTo(point) <= SOLID_BRUSH_VERTEX_WELD_EPSILON) {
      return index;
    }
  }
  return null;
}
