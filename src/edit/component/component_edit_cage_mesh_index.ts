import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MESH_HALF_EDGE_BOUNDARY_TWIN } from '@/mesh/topology/mesh_half_edge.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { packUndirectedEdge } from './component_selection_entry.js';
import type { ComponentCageMeshSource } from './component_edit_selection_draw.js';

/** One undirected mesh edge in document vertex indices. */
export interface ComponentEditMeshEdge {
  packed: number;
  a: number;
  b: number;
}

/**
 * Collects undirected edges from a mesh document, reusing the list while the
 * document generation stays the same.
 *
 * @param document Mesh document.
 * @returns Edge list.
 */
export function collectMeshEdges(document: MeshDocument): ComponentEditMeshEdge[] {
  const generation = document.getTopologyGeneration();
  const cached = meshEdgeCache.get(document);
  if (cached && cached.generation === generation) {
    return cached.edges;
  }
  const edges = buildUniqueMeshEdges(document);
  meshEdgeCache.set(document, { generation, edges });
  return edges;
}

/** Cached undirected edges for one document generation. */
interface MeshEdgeCacheEntry {
  generation: number;
  edges: ComponentEditMeshEdge[];
}

const meshEdgeCache = new WeakMap<MeshDocument, MeshEdgeCacheEntry>();

/**
 * Builds one undirected edge per half-edge pair.
 *
 * @param document Mesh document.
 * @returns Edge list.
 */
function buildUniqueMeshEdges(document: MeshDocument): ComponentEditMeshEdge[] {
  const topology = document.getTopology();
  const edges: ComponentEditMeshEdge[] = [];
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    appendUniqueHalfEdge(document, halfEdgeIndex, edges);
  }
  return edges;
}

/**
 * Appends a half-edge when it owns its undirected pair.
 *
 * @param document Mesh document.
 * @param halfEdgeIndex Half-edge index.
 * @param edges Output edges.
 */
function appendUniqueHalfEdge(document: MeshDocument, halfEdgeIndex: number, edges: ComponentEditMeshEdge[]): void {
  const topology = document.getTopology();
  const halfEdge = topology.getHalfEdge(halfEdgeIndex);
  if (halfEdge.twinIndex !== MESH_HALF_EDGE_BOUNDARY_TWIN && halfEdgeIndex > halfEdge.twinIndex) {
    return;
  }
  const vertexA = halfEdge.vertexIndex;
  const vertexB = topology.getHalfEdge(halfEdge.nextIndex).vertexIndex;
  edges.push({ packed: packUndirectedEdge(vertexA, vertexB), a: vertexA, b: vertexB });
}

/**
 * Collects corner vertices for the requested document faces.
 *
 * @param document Mesh document.
 * @param faceIndices Faces to walk, or undefined when none are selected.
 * @returns Face index to corner vertices.
 */
export function collectMeshFaceVertexIndices(
  document: MeshDocument,
  faceIndices: ReadonlySet<number> | undefined,
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (!faceIndices) {
    return map;
  }
  for (const faceIndex of faceIndices) {
    map.set(faceIndex, collectOneFaceVertexIndices(document, faceIndex));
  }
  return map;
}

/**
 * Collects corner vertex indices for one document face.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Corner vertices, empty when the face is missing.
 */
function collectOneFaceVertexIndices(document: MeshDocument, faceIndex: number): number[] {
  const topology = document.getTopology();
  const vertices: number[] = [];
  if (faceIndex < 0 || faceIndex >= topology.getFaceCount()) {
    return vertices;
  }
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    vertices.push(meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex));
  }
  return vertices;
}

/**
 * Collects world-space mesh document vertices, reusing them while the document
 * generation and world matrix stay the same.
 *
 * @param source Mesh source.
 * @returns World vertices.
 */
export function collectMeshWorldVertices(source: ComponentCageMeshSource): THREE.Vector3[] {
  const cached = readCachedWorldVertices(source);
  if (cached) {
    return cached;
  }
  const points = buildMeshWorldVertices(source);
  meshWorldVertexCache.set(source.mesh, {
    document: source.document,
    generation: source.document.getGeometryGeneration(),
    matrix: source.mesh.matrixWorld.elements.slice(),
    points,
  });
  return points;
}

/** Cached world vertices for one document, generation, and mesh pose. */
interface MeshWorldVertexCacheEntry {
  document: MeshDocument;
  generation: number;
  matrix: number[];
  points: THREE.Vector3[];
}

const meshWorldVertexCache = new WeakMap<THREE.Object3D, MeshWorldVertexCacheEntry>();

/**
 * Returns cached world vertices when the document and matrix are unchanged.
 *
 * @param source Mesh source.
 * @returns Cached points, or null when stale.
 */
function readCachedWorldVertices(source: ComponentCageMeshSource): THREE.Vector3[] | null {
  const cached = meshWorldVertexCache.get(source.mesh);
  if (!cached || !worldVertexCacheCanRefresh(cached, source)) {
    return null;
  }
  if (cached.generation !== source.document.getGeometryGeneration()) {
    rewriteCachedWorldVertices(cached.points, source);
    cached.generation = source.document.getGeometryGeneration();
  }
  return cached.points;
}

/**
 * Returns whether cached world vertices belong to this document and pose.
 *
 * @param cached Stored world vertices.
 * @param source Current mesh source.
 * @returns True when the points can be reused or rewritten.
 */
function worldVertexCacheCanRefresh(cached: MeshWorldVertexCacheEntry, source: ComponentCageMeshSource): boolean {
  if (cached.document !== source.document) {
    return false;
  }
  if (cached.points.length !== source.document.getTopology().getVertexCount()) {
    return false;
  }
  return matrixElementsMatch(cached.matrix, source.mesh.matrixWorld.elements);
}

/**
 * Writes current document positions into cached world vertices.
 *
 * @param points Cached world vertices.
 * @param source Mesh source.
 */
function rewriteCachedWorldVertices(points: THREE.Vector3[], source: ComponentCageMeshSource): void {
  const positions = source.document.getTopology().getPositions();
  const matrix = source.mesh.matrixWorld;
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  for (let vertexIndex = 0; vertexIndex < points.length; vertexIndex++) {
    rewriteOneCachedWorldVertex(points, vertexIndex, positions, matrix, scratch);
  }
}

/**
 * Transforms one cached world vertex from the document.
 *
 * @param points Cached world vertices.
 * @param vertexIndex Vertex index.
 * @param positions Packed local positions.
 * @param matrix World matrix.
 * @param scratch Position scratch.
 */
function rewriteOneCachedWorldVertex(
  points: THREE.Vector3[],
  vertexIndex: number,
  positions: Float32Array,
  matrix: THREE.Matrix4,
  scratch: { 0: number; 1: number; 2: number; length: number },
): void {
  meshVertexPositionRead(positions, vertexIndex, scratch);
  const point = points[vertexIndex];
  if (!point) {
    return;
  }
  point.set(scratch[0], scratch[1], scratch[2]).applyMatrix4(matrix);
}

/**
 * Returns whether two matrix element lists match.
 *
 * @param cached Cached elements.
 * @param live Live matrix elements.
 * @returns True when every element matches.
 */
function matrixElementsMatch(cached: readonly number[], live: ArrayLike<number>): boolean {
  if (cached.length !== live.length) {
    return false;
  }
  for (let index = 0; index < cached.length; index++) {
    if (cached[index] !== live[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Transforms document vertices into world space.
 *
 * @param source Mesh source.
 * @returns World vertices.
 */
function buildMeshWorldVertices(source: ComponentCageMeshSource): THREE.Vector3[] {
  const positions = source.document.getTopology().getPositions();
  const vertexCount = source.document.getTopology().getVertexCount();
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const worldVerts: THREE.Vector3[] = [];
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    meshVertexPositionRead(positions, vertexIndex, scratch);
    worldVerts.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]).applyMatrix4(source.mesh.matrixWorld));
  }
  return worldVerts;
}
