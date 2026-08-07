import { MESH_FACE_WALK_SAFETY_LIMIT } from './mesh_topology_constants.js';
import { MESH_HALF_EDGE_BOUNDARY_TWIN, meshHalfEdgeIsBoundary } from './mesh_half_edge.js';
import type { MeshTopology } from './mesh_topology.js';

/**
 * Collects destination vertex indices for every half-edge on a face loop.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @returns Ordered vertex indices around the face.
 */
export function meshTopologyFaceVertexIndices(topology: MeshTopology, faceIndex: number): number[] {
  const vertexIndices: number[] = [];
  meshTopologyWalkFaceHalfEdges(topology, faceIndex, (halfEdgeIndex) => {
    vertexIndices.push(topology.getHalfEdge(halfEdgeIndex).vertexIndex);
  });
  return vertexIndices;
}

/**
 * Collects half-edge indices for a face loop in winding order.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @returns Ordered half-edge indices.
 */
export function meshTopologyFaceHalfEdgeIndices(topology: MeshTopology, faceIndex: number): number[] {
  const halfEdgeIndices: number[] = [];
  meshTopologyWalkFaceHalfEdges(topology, faceIndex, (halfEdgeIndex) => {
    halfEdgeIndices.push(halfEdgeIndex);
  });
  return halfEdgeIndices;
}

/**
 * Returns the corner count of a face.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @returns Number of half-edges on the face.
 */
export function meshTopologyFaceCornerCount(topology: MeshTopology, faceIndex: number): number {
  return meshTopologyFaceHalfEdgeIndices(topology, faceIndex).length;
}

/**
 * Returns the face-corner vertex stored on a half-edge.
 *
 * @param topology Mesh topology.
 * @param halfEdgeIndex Half-edge index.
 * @returns Corner vertex index.
 */
export function meshTopologyHalfEdgeCornerVertex(topology: MeshTopology, halfEdgeIndex: number): number {
  return topology.getHalfEdge(halfEdgeIndex).vertexIndex;
}

/**
 * Returns the destination vertex of the directed edge (next corner on the
 * face).
 *
 * @param topology Mesh topology.
 * @param halfEdgeIndex Half-edge index.
 * @returns Destination vertex index.
 */
export function meshTopologyHalfEdgeDestinationVertex(topology: MeshTopology, halfEdgeIndex: number): number {
  const nextIndex = topology.getHalfEdge(halfEdgeIndex).nextIndex;
  return topology.getHalfEdge(nextIndex).vertexIndex;
}

/**
 * Counts half-edges whose twin is the boundary sentinel.
 *
 * @param topology Mesh topology.
 * @returns Boundary half-edge count.
 */
export function meshTopologyCountBoundaryHalfEdges(topology: MeshTopology): number {
  let count = 0;
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let index = 0; index < halfEdgeCount; index++) {
    if (meshHalfEdgeIsBoundary(topology.getHalfEdge(index))) {
      count += 1;
    }
  }
  return count;
}

/**
 * Walks half-edges around a face and invokes a callback for each.
 *
 * @param topology Mesh topology.
 * @param faceIndex Face index.
 * @param visit Callback receiving each half-edge index.
 */
export function meshTopologyWalkFaceHalfEdges(
  topology: MeshTopology,
  faceIndex: number,
  visit: (halfEdgeIndex: number) => void,
): void {
  const face = topology.getFace(faceIndex);
  const startIndex = face.halfEdgeIndex;
  let cursor = startIndex;
  for (let step = 0; step < MESH_FACE_WALK_SAFETY_LIMIT; step++) {
    visit(cursor);
    cursor = topology.getHalfEdge(cursor).nextIndex;
    if (cursor === startIndex) {
      return;
    }
  }
}

/**
 * Returns whether a twin index is a valid half-edge reference.
 *
 * @param topology Mesh topology.
 * @param twinIndex Twin index to test.
 * @returns True when twinIndex addresses a half-edge.
 */
export function meshTopologyTwinIndexIsValid(topology: MeshTopology, twinIndex: number): boolean {
  if (twinIndex === MESH_HALF_EDGE_BOUNDARY_TWIN) {
    return true;
  }
  return twinIndex >= 0 && twinIndex < topology.getHalfEdgeCount();
}
