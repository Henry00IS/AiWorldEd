import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import {
  fitSurfaceUvMatrixFromWorldSamples,
  type SurfaceUvWorldSample,
} from '@/texture/uv_matrix/surface_uv_matrix_fit.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Largest UV difference at which a corner still follows a planar fit. */
const MESH_FACE_CORNER_UV_FIT_TOLERANCE = 1e-4;

/**
 * Fits a document-space planar UV matrix that reproduces a face's corner UVs.
 *
 * @param document Mesh document with corner UVs.
 * @param faceIndex Face index.
 * @returns Fitted matrix, or null when the face is degenerate.
 */
export function meshFaceCornerUvFit(document: MeshDocument, faceIndex: number): SurfaceUvMatrix | null {
  return fitSurfaceUvMatrixFromWorldSamples(meshFaceCornerUvSamples(document, faceIndex));
}

/**
 * Tells whether every corner UV of a face equals what a planar matrix projects
 * for its position.
 *
 * @param document Mesh document with corner UVs.
 * @param faceIndex Face index.
 * @param fit Document-space planar UV matrix.
 * @returns True when all corners follow the matrix.
 */
export function meshFaceCornerUvsFollowFit(document: MeshDocument, faceIndex: number, fit: SurfaceUvMatrix): boolean {
  return meshFaceCornerUvSamples(document, faceIndex).every((sample) => {
    const projected = fit.project(sample.world);
    return (
      Math.abs(projected.u - sample.u) <= MESH_FACE_CORNER_UV_FIT_TOLERANCE &&
      Math.abs(projected.v - sample.v) <= MESH_FACE_CORNER_UV_FIT_TOLERANCE
    );
  });
}

/**
 * Reads a face's corners as document-space positions with their UVs.
 *
 * @param document Mesh document with corner UVs.
 * @param faceIndex Face index.
 * @returns One sample per corner.
 */
function meshFaceCornerUvSamples(document: MeshDocument, faceIndex: number): SurfaceUvWorldSample[] {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const uvs = document.getAttributes().getCornerUvs().getValues();
  return meshTopologyFaceHalfEdgeIndices(topology, faceIndex).map((halfEdge) => {
    const vertex = meshTopologyHalfEdgeCornerVertex(topology, halfEdge);
    return {
      world: new THREE.Vector3(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]),
      u: uvs[halfEdge * 2] ?? 0,
      v: uvs[halfEdge * 2 + 1] ?? 0,
    };
  });
}
