import { createMeshFace } from './mesh_face.js';
import { MESH_HALF_EDGE_BOUNDARY_TWIN, createMeshHalfEdge } from './mesh_half_edge.js';
import { MeshTopology } from './mesh_topology.js';
import { MESH_VERTEX_POSITION_STRIDE } from './mesh_topology_constants.js';

/**
 * Builds mesh topology from vertex positions and polygonal face loops. Twins
 * are paired by directed edge keys; unpaired edges remain boundary. Faces may
 * be triangles, quads, or higher n-gons.
 */
export class MeshTopologyBuilder {
  private readonly positions: number[];
  private readonly faces: number[][];

  /** Creates an empty builder. */
  constructor() {
    this.positions = [];
    this.faces = [];
  }

  /**
   * Appends a vertex and returns its index.
   *
   * @param x Local X.
   * @param y Local Y.
   * @param z Local Z.
   * @returns New vertex index.
   */
  appendVertex(x: number, y: number, z: number): number {
    const vertexIndex = Math.floor(this.positions.length / MESH_VERTEX_POSITION_STRIDE);
    this.positions.push(x, y, z);
    return vertexIndex;
  }

  /**
   * Appends a triangle face by three vertex indices (winding order).
   *
   * @param vertexA First vertex index.
   * @param vertexB Second vertex index.
   * @param vertexC Third vertex index.
   */
  appendTriangle(vertexA: number, vertexB: number, vertexC: number): void {
    this.appendFace([vertexA, vertexB, vertexC]);
  }

  /**
   * Appends a polygonal face by ordered vertex indices (winding order).
   *
   * @param vertexIndices Corner vertex indices (at least three).
   */
  appendFace(vertexIndices: readonly number[]): void {
    if (vertexIndices.length < 3) {
      return;
    }
    this.faces.push(vertexIndices.slice());
  }

  /**
   * Builds a topology from the accumulated vertices and faces.
   *
   * @returns New mesh topology with paired twins.
   */
  build(): MeshTopology {
    const topology = new MeshTopology();
    topology.setPositions(Float32Array.from(this.positions));
    this.appendAllFacesToTopology(topology);
    pairMeshTopologyTwins(topology);
    return topology;
  }

  /**
   * Appends every stored face loop onto the topology.
   *
   * @param topology Target topology.
   */
  private appendAllFacesToTopology(topology: MeshTopology): void {
    for (const face of this.faces) {
      appendPolygonFaceOnTopology(topology, face);
    }
  }
}

/**
 * Builds topology from packed positions and polygonal face loops.
 *
 * @param positions Packed xyz floats.
 * @param faces Ordered vertex index loops (each length ≥ 3).
 * @returns New mesh topology with paired twins.
 */
export function meshTopologyFromPolygonFaces(
  positions: Float32Array,
  faces: readonly (readonly number[])[],
): MeshTopology {
  const topology = new MeshTopology();
  topology.setPositions(new Float32Array(positions));
  for (const face of faces) {
    appendPolygonFaceOnTopology(topology, face);
  }
  pairMeshTopologyTwins(topology);
  return topology;
}

/**
 * Appends one polygonal face loop on an existing topology. Half-edge
 * vertexIndex is the face-corner vertex in winding order.
 *
 * @param topology Target topology.
 * @param vertexIndices Ordered corner vertices (length ≥ 3).
 */
export function appendPolygonFaceOnTopology(topology: MeshTopology, vertexIndices: readonly number[]): void {
  if (vertexIndices.length < 3) {
    return;
  }
  const faceIndex = topology.getFaceCount();
  const halfEdgeStart = topology.getHalfEdgeCount();
  const cornerCount = vertexIndices.length;
  for (let corner = 0; corner < cornerCount; corner++) {
    const nextHalfEdge = halfEdgeStart + ((corner + 1) % cornerCount);
    topology.appendHalfEdge(
      createMeshHalfEdge(vertexIndices[corner]!, MESH_HALF_EDGE_BOUNDARY_TWIN, nextHalfEdge, faceIndex),
    );
  }
  topology.appendFace(createMeshFace(halfEdgeStart));
}

/**
 * Pairs opposite half-edges by directed vertex pair. Leaves unpaired edges as
 * boundary.
 *
 * @param topology Topology whose twins are written in place.
 */
export function pairMeshTopologyTwins(topology: MeshTopology): void {
  const edgeKeyToHalfEdge = buildDirectedEdgeKeyMap(topology);
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    pairSingleHalfEdgeTwin(topology, halfEdgeIndex, edgeKeyToHalfEdge);
  }
}

/**
 * Maps each directed edge key to its half-edge index. With corner-vertex
 * half-edges, the directed edge runs from this corner to the next corner.
 *
 * @param topology Mesh topology.
 * @returns Map from "origin>dest" to half-edge index.
 */
function buildDirectedEdgeKeyMap(topology: MeshTopology): Map<string, number> {
  const map = new Map<string, number>();
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    const origin = topology.getHalfEdge(halfEdgeIndex).vertexIndex;
    const destination = topology.getHalfEdge(topology.getHalfEdge(halfEdgeIndex).nextIndex).vertexIndex;
    map.set(makeDirectedEdgeKey(origin, destination), halfEdgeIndex);
  }
  return map;
}

/**
 * Pairs one half-edge with its reverse directed twin when present.
 *
 * @param topology Mesh topology.
 * @param halfEdgeIndex Half-edge to pair.
 * @param edgeKeyToHalfEdge Directed edge lookup.
 */
function pairSingleHalfEdgeTwin(
  topology: MeshTopology,
  halfEdgeIndex: number,
  edgeKeyToHalfEdge: Map<string, number>,
): void {
  const halfEdge = topology.getHalfEdge(halfEdgeIndex);
  const origin = halfEdge.vertexIndex;
  const destination = topology.getHalfEdge(halfEdge.nextIndex).vertexIndex;
  const twinIndex = edgeKeyToHalfEdge.get(makeDirectedEdgeKey(destination, origin));
  if (twinIndex === undefined) {
    return;
  }
  topology.writeHalfEdge(
    halfEdgeIndex,
    createMeshHalfEdge(halfEdge.vertexIndex, twinIndex, halfEdge.nextIndex, halfEdge.faceIndex),
  );
}

/**
 * Builds a directed edge map key.
 *
 * @param origin Origin vertex index.
 * @param destination Destination vertex index.
 * @returns Stable string key.
 */
function makeDirectedEdgeKey(origin: number, destination: number): string {
  return `${origin}>${destination}`;
}
