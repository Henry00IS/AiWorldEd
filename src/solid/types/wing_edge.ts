/**
 * Directed half-edge in the wing-edge (half-edge) topology of a convex solid brush.
 * twinIndex links to the opposite directed edge on the adjacent face.
 */
export interface WingEdge {
  /** Index into the brush vertex array for the destination vertex. */
  vertexIndex: number;
  /** Index of the opposite half-edge on the neighboring face. */
  twinIndex: number;
}

/**
 * Convex polygonal face stored as a contiguous run of wing edges.
 */
export interface SolidFace {
  /** Index of the first wing edge belonging to this face. */
  firstEdge: number;
  /** Number of consecutive wing edges that form this face. */
  edgeCount: number;
  /** Optional surface material / description index for the face. */
  surfaceIndex: number;
}

/**
 * Creates a wing edge with the given vertex and twin indices.
 * @param vertexIndex Destination vertex index.
 * @param twinIndex Opposite half-edge index.
 * @returns New wing edge value.
 */
export function createWingEdge(vertexIndex: number, twinIndex: number): WingEdge {
  return { vertexIndex, twinIndex };
}

/**
 * Creates a solid face descriptor.
 * @param firstEdge First edge index in the wing-edge array.
 * @param edgeCount Number of edges on the face.
 * @param surfaceIndex Surface description index.
 * @returns New solid face value.
 */
export function createSolidFace(
  firstEdge: number,
  edgeCount: number,
  surfaceIndex: number = 0
): SolidFace {
  return { firstEdge, edgeCount, surfaceIndex };
}
