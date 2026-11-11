/** Sentinel twin index for a boundary half-edge with no opposite face. */
export const MESH_HALF_EDGE_BOUNDARY_TWIN = -1;

/** Sentinel face index for a half-edge that is not owned by any face. */
export const MESH_HALF_EDGE_NO_FACE = -1;

/**
 * Directed half-edge in an editable mesh topology. vertexIndex is the
 * face-corner vertex. The directed edge runs from this corner to the next
 * corner on the face. Open meshes use {@link MESH_HALF_EDGE_BOUNDARY_TWIN} when
 * no opposite half-edge exists.
 */
export interface MeshHalfEdge {
  /** Face-corner vertex index for this half-edge. */
  vertexIndex: number;
  /** Opposite half-edge index, or {@link MESH_HALF_EDGE_BOUNDARY_TWIN}. */
  twinIndex: number;
  /** Next half-edge index walking around the owning face. */
  nextIndex: number;
  /** Owning face index, or {@link MESH_HALF_EDGE_NO_FACE}. */
  faceIndex: number;
}

/**
 * Creates a half-edge value.
 *
 * @param vertexIndex Face-corner vertex index.
 * @param twinIndex Opposite half-edge index or boundary sentinel.
 * @param nextIndex Next half-edge around the face.
 * @param faceIndex Owning face index or no-face sentinel.
 * @returns New half-edge value.
 */
export function createMeshHalfEdge(
  vertexIndex: number,
  twinIndex: number,
  nextIndex: number,
  faceIndex: number,
): MeshHalfEdge {
  return { vertexIndex, twinIndex, nextIndex, faceIndex };
}

/**
 * Returns whether a half-edge lies on the mesh boundary.
 *
 * @param halfEdge Half-edge to test.
 * @returns True when the twin is the boundary sentinel.
 */
export function meshHalfEdgeIsBoundary(halfEdge: MeshHalfEdge): boolean {
  return halfEdge.twinIndex === MESH_HALF_EDGE_BOUNDARY_TWIN;
}

/**
 * Clones a half-edge value.
 *
 * @param halfEdge Source half-edge.
 * @returns Independent copy.
 */
export function cloneMeshHalfEdge(halfEdge: MeshHalfEdge): MeshHalfEdge {
  return createMeshHalfEdge(halfEdge.vertexIndex, halfEdge.twinIndex, halfEdge.nextIndex, halfEdge.faceIndex);
}
