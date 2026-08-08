import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshCornerUvsFromBufferGeometry } from '@/mesh/convert/mesh_corner_uv_from_vertex_uv.js';
import { meshDocumentFromTriangleList } from '@/mesh/convert/mesh_from_triangle_list.js';
import { captureMeshDocumentFaceTexturesFromDisplay } from '@/mesh/convert/mesh_document_face_texture_sync.js';

/** Default position merge epsilon for edit-session welding (meters). */
const MESH_EDIT_WELD_EPSILON = 1e-5;

/**
 * Builds a welded MeshDocument from BufferGeometry for legacy meshes that have
 * no authored document. Shared corners become single topology vertices. Each
 * GPU triangle becomes one document face; coplanar faces are never merged here
 * so Edit Mode topology stays stable and is not re-derived from display
 * triangulation after ear-clip expansion.
 *
 * @param geometry Source render geometry.
 * @param weldEpsilon Optional merge distance.
 * @param mesh Optional display mesh used to capture multi-texture face maps.
 * @returns Welded triangle mesh document.
 */
export function meshDocumentFromBufferGeometryWelded(
  geometry: THREE.BufferGeometry,
  weldEpsilon: number = MESH_EDIT_WELD_EPSILON,
  mesh?: THREE.Mesh,
): MeshDocument {
  const rawPositions = readPackedPositions(geometry);
  const rawTriangles = readFlatTriangleIndices(geometry);
  const cornerUvs = meshCornerUvsFromBufferGeometry(geometry, rawTriangles);
  const welded = weldTriangleMesh(rawPositions, rawTriangles, weldEpsilon);
  const triangleDocument = meshDocumentFromTriangleList(welded.positions, welded.triangleIndices, cornerUvs);
  if (mesh) {
    captureMeshDocumentFaceTexturesFromDisplay(mesh, triangleDocument);
  }
  return triangleDocument;
}

/**
 * Welds coincident vertices and rewrites triangle indices.
 *
 * @param positions Packed xyz floats.
 * @param triangleIndices Flat triangle indices.
 * @param weldEpsilon Merge distance.
 * @returns Welded buffers.
 */
export function weldTriangleMesh(
  positions: Float32Array,
  triangleIndices: number[],
  weldEpsilon: number,
): { positions: Float32Array; triangleIndices: number[] } {
  const invEpsilon = 1 / Math.max(weldEpsilon, 1e-12);
  const keyToWelded = new Map<string, number>();
  const weldedPositions: number[] = [];
  const remap: number[] = [];
  const vertexCount = Math.floor(positions.length / 3);
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    remap.push(weldOneVertex(positions, vertexIndex, invEpsilon, keyToWelded, weldedPositions));
  }
  const rewritten: number[] = [];
  for (const sourceIndex of triangleIndices) {
    rewritten.push(remap[sourceIndex] ?? 0);
  }
  return {
    positions: new Float32Array(weldedPositions),
    triangleIndices: rewritten,
  };
}

/**
 * Welds or inserts one source vertex.
 *
 * @param positions Source packed positions.
 * @param vertexIndex Source vertex index.
 * @param invEpsilon Inverse weld epsilon for quantization.
 * @param keyToWelded Quantized key → welded index.
 * @param weldedPositions Growing packed welded positions.
 * @returns Welded vertex index.
 */
function weldOneVertex(
  positions: Float32Array,
  vertexIndex: number,
  invEpsilon: number,
  keyToWelded: Map<string, number>,
  weldedPositions: number[],
): number {
  const x = positions[vertexIndex * 3]!;
  const y = positions[vertexIndex * 3 + 1]!;
  const z = positions[vertexIndex * 3 + 2]!;
  const key = `${Math.round(x * invEpsilon)}:${Math.round(y * invEpsilon)}:${Math.round(z * invEpsilon)}`;
  const existing = keyToWelded.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const weldedIndex = weldedPositions.length / 3;
  keyToWelded.set(key, weldedIndex);
  weldedPositions.push(x, y, z);
  return weldedIndex;
}

/**
 * Reads packed positions from geometry.
 *
 * @param geometry Source geometry.
 * @returns Packed xyz floats.
 */
function readPackedPositions(geometry: THREE.BufferGeometry): Float32Array {
  const position = geometry.getAttribute('position');
  if (!position) {
    return new Float32Array(0);
  }
  const packed = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    packed[index * 3] = position.getX(index);
    packed[index * 3 + 1] = position.getY(index);
    packed[index * 3 + 2] = position.getZ(index);
  }
  return packed;
}

/**
 * Reads flat triangle indices from geometry.
 *
 * @param geometry Source geometry.
 * @returns Flat triangle vertex indices.
 */
function readFlatTriangleIndices(geometry: THREE.BufferGeometry): number[] {
  const position = geometry.getAttribute('position');
  if (!position) {
    return [];
  }
  const index = geometry.getIndex();
  if (!index) {
    const values: number[] = [];
    for (let i = 0; i < position.count; i++) {
      values.push(i);
    }
    return values;
  }
  const values: number[] = [];
  for (let i = 0; i < index.count; i++) {
    values.push(index.getX(i));
  }
  return values;
}
