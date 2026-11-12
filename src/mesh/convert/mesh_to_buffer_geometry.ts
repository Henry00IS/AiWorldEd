import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { triangulateSimplePolygon3d } from './mesh_polygon_triangulate.js';

/**
 * Builds a display BufferGeometry from a mesh document. Corners are expanded so
 * face-corner UVs do not fight shared topology vertices (GPU split). N-gons are
 * ear-clip triangulated for the index buffer.
 *
 * @param document Source mesh document.
 * @returns New buffer geometry with position, index, and uv attributes.
 */
export function meshDocumentToBufferGeometry(document: MeshDocument): THREE.BufferGeometry {
  const expanded = expandDocumentCorners(document);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(expanded.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(expanded.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(expanded.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Expanded GPU buffers for one document. */
interface ExpandedCornerBuffers {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/**
 * Expands each face corner into a unique GPU vertex and triangulates faces.
 *
 * @param document Source document.
 * @returns Expanded position, uv, and index buffers.
 */
function expandDocumentCorners(document: MeshDocument): ExpandedCornerBuffers {
  const topology = document.getTopology();
  const cornerUvs = document.getAttributes().getCornerUvs();
  const faceCount = topology.getFaceCount();
  const cornerCount = countTotalCorners(document);
  const positions = new Float32Array(cornerCount * 3);
  const uvs = new Float32Array(cornerCount * 2);
  const triangleIndexList: number[] = [];
  let cornerWrite = 0;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    cornerWrite = writeFaceCornersAndTriangles(
      document,
      faceIndex,
      positions,
      uvs,
      triangleIndexList,
      cornerWrite,
      cornerUvs.getValues(),
    );
  }
  return {
    positions,
    uvs,
    indices: Uint32Array.from(triangleIndexList),
  };
}

/**
 * Counts all face corners in a document.
 *
 * @param document Mesh document.
 * @returns Corner count.
 */
function countTotalCorners(document: MeshDocument): number {
  return document.getTopology().getHalfEdgeCount();
}

/**
 * Writes one face's expanded corners and ear-clip triangle indices.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param positions Output positions.
 * @param uvs Output uvs.
 * @param triangleIndexList Output triangle indices.
 * @param cornerWrite Next free corner slot.
 * @param cornerUvValues Packed corner UV buffer.
 * @returns Updated corner write cursor.
 */
function writeFaceCornersAndTriangles(
  document: MeshDocument,
  faceIndex: number,
  positions: Float32Array,
  uvs: Float32Array,
  triangleIndexList: number[],
  cornerWrite: number,
  cornerUvValues: Float32Array,
): number {
  const topology = document.getTopology();
  const halfEdgeIndices = meshTopologyFaceHalfEdgeIndices(topology, faceIndex);
  const faceCornerStart = cornerWrite;
  const facePoints: Array<{ x: number; y: number; z: number }> = [];
  for (const halfEdgeIndex of halfEdgeIndices) {
    writeOneCorner(document, halfEdgeIndex, positions, uvs, cornerWrite, cornerUvValues);
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const source = topology.getPositions();
    const base = vertexIndex * 3;
    facePoints.push({
      x: source[base]!,
      y: source[base + 1]!,
      z: source[base + 2]!,
    });
    cornerWrite += 1;
  }
  appendFaceTriangleIndices(facePoints, faceCornerStart, triangleIndexList);
  return cornerWrite;
}

/**
 * Appends ear-clip (or trivial) triangle indices for one expanded face.
 *
 * @param facePoints Ordered face corner positions.
 * @param faceCornerStart First expanded corner index of the face.
 * @param triangleIndexList Output index list.
 */
function appendFaceTriangleIndices(
  facePoints: ReadonlyArray<{ x: number; y: number; z: number }>,
  faceCornerStart: number,
  triangleIndexList: number[],
): void {
  if (facePoints.length < 3) {
    return;
  }
  if (facePoints.length === 3) {
    triangleIndexList.push(faceCornerStart, faceCornerStart + 1, faceCornerStart + 2);
    return;
  }
  const loopTriangles = triangulateSimplePolygon3d(facePoints);
  if (loopTriangles.length !== (facePoints.length - 2) * 3) {
    appendFaceFanIndices(facePoints.length, faceCornerStart, triangleIndexList);
    return;
  }
  for (let index = 0; index < loopTriangles.length; index++) {
    triangleIndexList.push(faceCornerStart + loopTriangles[index]!);
  }
}

/**
 * Appends a fan for a face the ear clip cannot split (folded or degenerate), so
 * every face keeps its corners - 2 display triangles: picking and face texture
 * maps address display triangles by that count.
 *
 * @param cornerCount Face corner count.
 * @param faceCornerStart First expanded corner index of the face.
 * @param triangleIndexList Output index list.
 */
function appendFaceFanIndices(cornerCount: number, faceCornerStart: number, triangleIndexList: number[]): void {
  for (let corner = 1; corner < cornerCount - 1; corner++) {
    triangleIndexList.push(faceCornerStart, faceCornerStart + corner, faceCornerStart + corner + 1);
  }
}

/**
 * Writes one expanded corner position and UV.
 *
 * @param document Mesh document.
 * @param halfEdgeIndex Half-edge / corner index.
 * @param positions Output positions.
 * @param uvs Output uvs.
 * @param cornerSlot Expanded corner index.
 * @param cornerUvValues Packed corner UV buffer.
 */
function writeOneCorner(
  document: MeshDocument,
  halfEdgeIndex: number,
  positions: Float32Array,
  uvs: Float32Array,
  cornerSlot: number,
  cornerUvValues: Float32Array,
): void {
  const topology = document.getTopology();
  const vertexIndex = topology.getHalfEdge(halfEdgeIndex).vertexIndex;
  const source = topology.getPositions();
  const positionBase = vertexIndex * 3;
  const destBase = cornerSlot * 3;
  positions[destBase] = source[positionBase]!;
  positions[destBase + 1] = source[positionBase + 1]!;
  positions[destBase + 2] = source[positionBase + 2]!;
  const uvBase = halfEdgeIndex * 2;
  const uvDest = cornerSlot * 2;
  uvs[uvDest] = cornerUvValues[uvBase] ?? 0;
  uvs[uvDest + 1] = cornerUvValues[uvBase + 1] ?? 0;
}
