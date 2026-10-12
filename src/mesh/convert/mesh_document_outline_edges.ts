import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import {
  MESH_DOCUMENT_OUTLINE_EDGE_CACHE_KEY,
  readPersistentMeshDocument,
  writePersistentMeshDocument,
} from '@/mesh/document/mesh_document_binding.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import { meshDocumentFromBufferGeometryWelded } from '@/edit/mesh/mesh_edit_weld.js';

/** UserData key storing the topology vertex of each outline point. */
export const MESH_OUTLINE_ENDPOINT_VERTICES_KEY = 'meshOutlineEndpointVertices';

/** Cached outline edges tied to a topology stamp. */
interface DocumentOutlineEdgeCache {
  stamp: string;
  edges: THREE.BufferGeometry;
}

/**
 * Ensures a content mesh has a persistent MeshDocument for outline topology.
 * Callers should rebuild decorative edges afterward. Used after scene load so
 * object-mode lines can match Edit Mode without an edit enter/exit cycle.
 *
 * @param mesh Content mesh.
 */
export function ensurePersistentMeshDocumentForOutlines(mesh: THREE.Mesh): void {
  if (readPersistentMeshDocument(mesh)) {
    return;
  }
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) {
    return;
  }
  const document = meshDocumentFromBufferGeometryWelded(mesh.geometry, undefined, mesh);
  if (document.getTopology().getVertexCount() === 0) {
    return;
  }
  writePersistentMeshDocument(mesh, document);
}

/**
 * Builds or returns cached local-space outline edges from the mesh MeshDocument
 * when present. Uses wing-edge topology so n-gon faces do not emit ear-clip
 * diagonals (matches Edit Mode cage lines).
 *
 * @param mesh Content mesh that may own a persistent or session document.
 * @returns Outline edge geometry, or null when no document is bound.
 */
export function getOrBuildMeshDocumentOutlineEdges(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  const document = readMeshDocumentForOutline(mesh);
  if (!document) {
    return null;
  }
  const stamp = buildDocumentOutlineStamp(document);
  const geometry = mesh.geometry;
  const existing = geometry.userData[MESH_DOCUMENT_OUTLINE_EDGE_CACHE_KEY] as DocumentOutlineEdgeCache | undefined;
  if (existing && existing.stamp === stamp) {
    return existing.edges;
  }
  if (existing) {
    existing.edges.dispose();
  }
  const edges = buildMeshDocumentOutlineEdgeGeometry(document);
  geometry.userData[MESH_DOCUMENT_OUTLINE_EDGE_CACHE_KEY] = { stamp, edges } satisfies DocumentOutlineEdgeCache;
  return edges;
}

/**
 * Builds undirected local-space edge line geometry from a MeshDocument.
 *
 * @param document Source mesh document.
 * @returns New BufferGeometry of line segments.
 */
export function buildMeshDocumentOutlineEdgeGeometry(document: MeshDocument): THREE.BufferGeometry {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const seen = new Set<string>();
  const coords: number[] = [];
  const endpoints: number[] = [];
  const scratchA = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const scratchB = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    appendFaceBoundaryEdges(topology, positions, faceIndex, seen, coords, endpoints, scratchA, scratchB);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  geometry.userData[MESH_OUTLINE_ENDPOINT_VERTICES_KEY] = Int32Array.from(endpoints);
  return geometry;
}

/**
 * Writes current document positions into an outline buffer built from that
 * document.
 *
 * @param edges Outline line geometry.
 * @param document Source document.
 * @returns True when positions were updated.
 */
export function patchMeshDocumentOutlinePositions(edges: THREE.BufferGeometry, document: MeshDocument): boolean {
  const endpoints = edges.userData[MESH_OUTLINE_ENDPOINT_VERTICES_KEY];
  const position = edges.getAttribute('position');
  if (!(endpoints instanceof Int32Array) || !(position instanceof THREE.BufferAttribute)) {
    return false;
  }
  if (!(position.array instanceof Float32Array) || endpoints.length !== position.count) {
    return false;
  }
  writeOutlineEndpointPositions(document, endpoints, position.array);
  position.needsUpdate = true;
  return true;
}

/**
 * Copies topology positions into outline endpoints.
 *
 * @param document Source document.
 * @param endpoints Topology vertex of each outline point.
 * @param positions Outline position buffer.
 */
function writeOutlineEndpointPositions(document: MeshDocument, endpoints: Int32Array, positions: Float32Array): void {
  const source = document.getTopology().getPositions();
  for (let point = 0; point < endpoints.length; point++) {
    writeOneOutlinePoint(source, endpoints[point] ?? 0, positions, point);
  }
}

/**
 * Writes one outline point from a topology vertex.
 *
 * @param source Packed topology positions.
 * @param vertexIndex Topology vertex.
 * @param positions Outline position buffer.
 * @param point Outline point index.
 */
function writeOneOutlinePoint(source: Float32Array, vertexIndex: number, positions: Float32Array, point: number): void {
  const src = vertexIndex * 3;
  const dest = point * 3;
  positions[dest] = source[src] ?? 0;
  positions[dest + 1] = source[src + 1] ?? 0;
  positions[dest + 2] = source[src + 2] ?? 0;
}

/**
 * Builds a stable undirected edge key from two vertex indices.
 *
 * @param vertexIndexA First vertex index.
 * @param vertexIndexB Second vertex index.
 * @returns Edge key.
 */
function buildOutlineEdgeKey(vertexIndexA: number, vertexIndexB: number): string {
  return vertexIndexA < vertexIndexB ? `${vertexIndexA}:${vertexIndexB}` : `${vertexIndexB}:${vertexIndexA}`;
}

/**
 * Appends undirected edges of one face into the coordinate list.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param faceIndex Face index.
 * @param seen Deduped undirected edge keys.
 * @param coords Output xyz pairs.
 * @param scratchA Reusable position scratch.
 * @param scratchB Reusable position scratch.
 */
function appendFaceBoundaryEdges(
  topology: ReturnType<MeshDocument['getTopology']>,
  positions: Float32Array,
  faceIndex: number,
  seen: Set<string>,
  coords: number[],
  endpoints: number[],
  scratchA: { 0: number; 1: number; 2: number; length: number },
  scratchB: { 0: number; 1: number; 2: number; length: number },
): void {
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    appendUniqueOutlineEdge(topology, positions, halfEdgeIndex, seen, coords, endpoints, scratchA, scratchB);
  }
}

/**
 * Appends one undirected edge when it has not been recorded yet.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param halfEdgeIndex Half-edge index.
 * @param seen Deduped undirected edge keys.
 * @param coords Output xyz pairs.
 * @param endpoints Output topology vertices.
 * @param scratchA Reusable position scratch.
 * @param scratchB Reusable position scratch.
 */
function appendUniqueOutlineEdge(
  topology: ReturnType<MeshDocument['getTopology']>,
  positions: Float32Array,
  halfEdgeIndex: number,
  seen: Set<string>,
  coords: number[],
  endpoints: number[],
  scratchA: { 0: number; 1: number; 2: number; length: number },
  scratchB: { 0: number; 1: number; 2: number; length: number },
): void {
  const vertexA = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
  const vertexB = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
  const edgeKey = buildOutlineEdgeKey(vertexA, vertexB);
  if (seen.has(edgeKey)) {
    return;
  }
  seen.add(edgeKey);
  meshVertexPositionRead(positions, vertexA, scratchA);
  meshVertexPositionRead(positions, vertexB, scratchB);
  coords.push(scratchA[0], scratchA[1], scratchA[2], scratchB[0], scratchB[1], scratchB[2]);
  endpoints.push(vertexA, vertexB);
}

/**
 * Reads the persistent authored MeshDocument used for object-mode outlines.
 *
 * @param mesh Content mesh.
 * @returns Mesh document, or null.
 */
function readMeshDocumentForOutline(mesh: THREE.Mesh): MeshDocument | null {
  return readPersistentMeshDocument(mesh);
}

/**
 * Builds a cache stamp from document topology generation.
 *
 * @param document Mesh document.
 * @returns Stamp string.
 */
function buildDocumentOutlineStamp(document: MeshDocument): string {
  const topology = document.getTopology();
  return `topo:${topology.getVertexCount()}:${topology.getFaceCount()}:${topology.getHalfEdgeCount()}`;
}
