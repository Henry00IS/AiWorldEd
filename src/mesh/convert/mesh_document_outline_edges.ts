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

/** Cached outline edges tied to a document generation stamp. */
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
  const scratchA = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const scratchB = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    appendFaceBoundaryEdges(topology, positions, faceIndex, seen, coords, scratchA, scratchB);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  return geometry;
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
  scratchA: { 0: number; 1: number; 2: number; length: number },
  scratchB: { 0: number; 1: number; 2: number; length: number },
): void {
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexA = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const vertexB = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
    const edgeKey = buildOutlineEdgeKey(vertexA, vertexB);
    if (seen.has(edgeKey)) {
      continue;
    }
    seen.add(edgeKey);
    meshVertexPositionRead(positions, vertexA, scratchA);
    meshVertexPositionRead(positions, vertexB, scratchB);
    coords.push(scratchA[0], scratchA[1], scratchA[2], scratchB[0], scratchB[1], scratchB[2]);
  }
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
  return `doc:${document.getGeometryGeneration()}:${document.getTopology().getFaceCount()}:${document.getTopology().getHalfEdgeCount()}`;
}
