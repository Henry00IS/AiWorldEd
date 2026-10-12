import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import {
  readMeshDocumentFaceTextureId,
  writeMeshDocumentFaceTextureId,
} from '@/mesh/convert/mesh_document_face_texture_sync.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Builds working geometry from a mesh document.
 *
 * @param document Source document.
 * @returns Working copy.
 */
export function meshDocumentToWorkingGeometry(document: MeshDocument): TopologyWorkingGeometry {
  return {
    positions: readMeshDocumentPositions(document),
    faces: readMeshDocumentWorkingFaces(document),
  };
}

/**
 * Rebuilds a mesh document from working geometry.
 *
 * @param geometry Working geometry.
 * @returns New mesh document.
 */
export function workingGeometryToMeshDocument(geometry: TopologyWorkingGeometry): MeshDocument {
  const packed = packWorkingPositions(geometry.positions);
  const loops = geometry.faces.map((face) => face.vertexIndices);
  const cornerUvs = packWorkingCornerUvs(geometry.faces);
  const document = meshDocumentFromPolygonList(packed, loops, cornerUvs);
  writeWorkingFaceTextures(document, geometry.faces);
  return document;
}

/**
 * Reads document vertex positions into vectors.
 *
 * @param document Source document.
 * @returns Position list.
 */
function readMeshDocumentPositions(document: MeshDocument): THREE.Vector3[] {
  const topology = document.getTopology();
  const packed = topology.getPositions();
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as {
    0: number;
    1: number;
    2: number;
    length: number;
  };
  const positions: THREE.Vector3[] = [];
  const vertexCount = topology.getVertexCount();
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    meshVertexPositionRead(packed, vertexIndex, scratch);
    positions.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]));
  }
  return positions;
}

/**
 * Reads document faces into working faces with UVs and textures.
 *
 * @param document Source document.
 * @returns Working faces.
 */
function readMeshDocumentWorkingFaces(document: MeshDocument): TopologyWorkingFace[] {
  const topology = document.getTopology();
  const faces: TopologyWorkingFace[] = [];
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faces.push(readOneMeshDocumentWorkingFace(document, faceIndex));
  }
  return faces;
}

/**
 * Reads one document face into a working face.
 *
 * @param document Source document.
 * @param faceIndex Face index.
 * @returns Working face.
 */
function readOneMeshDocumentWorkingFace(document: MeshDocument, faceIndex: number): TopologyWorkingFace {
  const topology = document.getTopology();
  const halfEdges = meshTopologyFaceHalfEdgeIndices(topology, faceIndex);
  const vertexIndices: number[] = [];
  const cornerUvs: Array<{ u: number; v: number }> = [];
  const uvScratch = { 0: 0, 1: 0, length: 2 } as { 0: number; 1: number; length: number };
  const store = document.getAttributes().getCornerUvs();
  for (const halfEdgeIndex of halfEdges) {
    vertexIndices.push(meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex));
    store.read(halfEdgeIndex, uvScratch);
    cornerUvs.push({ u: uvScratch[0], v: uvScratch[1] });
  }
  return {
    vertexIndices,
    cornerUvs,
    textureId: readMeshDocumentFaceTextureId(document, faceIndex),
  };
}

/**
 * Packs working positions into an xyz float buffer.
 *
 * @param positions Vertex positions.
 * @returns Packed xyz floats.
 */
function packWorkingPositions(positions: readonly THREE.Vector3[]): Float32Array {
  const packed = new Float32Array(positions.length * 3);
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    if (!position) {
      continue;
    }
    packed[index * 3] = position.x;
    packed[index * 3 + 1] = position.y;
    packed[index * 3 + 2] = position.z;
  }
  return packed;
}

/**
 * Packs face-order corner UVs into an interleaved buffer.
 *
 * @param faces Working faces.
 * @returns Packed u,v floats.
 */
function packWorkingCornerUvs(faces: readonly TopologyWorkingFace[]): Float32Array {
  let cornerCount = 0;
  for (const face of faces) {
    cornerCount += face.cornerUvs.length;
  }
  const packed = new Float32Array(cornerCount * 2);
  let write = 0;
  for (const face of faces) {
    write = writeFaceCornerUvs(face, packed, write);
  }
  return packed;
}

/**
 * Writes one face's corner UVs into a packed buffer.
 *
 * @param face Working face.
 * @param packed Destination buffer.
 * @param write Next write index.
 * @returns Next write index.
 */
function writeFaceCornerUvs(face: TopologyWorkingFace, packed: Float32Array, write: number): number {
  let cursor = write;
  for (const uv of face.cornerUvs) {
    packed[cursor] = uv.u;
    packed[cursor + 1] = uv.v;
    cursor += 2;
  }
  return cursor;
}

/**
 * Copies working face texture ids onto a rebuilt document.
 *
 * @param document Destination document.
 * @param faces Working faces in document face order.
 */
function writeWorkingFaceTextures(document: MeshDocument, faces: readonly TopologyWorkingFace[]): void {
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    const face = faces[faceIndex];
    if (!face) {
      continue;
    }
    writeMeshDocumentFaceTextureId(document, faceIndex, face.textureId);
  }
}
