import * as THREE from 'three';
import { findConnectedCoplanarFaceIndices } from '@/selection/pick/utils_triangle_geometry.js';
import { findSameSolidBrushSurfaceIndicesFast } from './solid_triangle_source_index.js';

/** Per-triangle solid CSG source identity stored on result meshes. */
export interface SolidTriangleSourceRef {
  brushId: string;
  surfaceIndex: number;
  derivedId?: string;
}

/**
 * Expands a face pick to one selectable face unit. Solid CSG results stay
 * within one authored brush face (brushId + surfaceIndex) so adjacent walls and
 * carpet/detail brushes remain independently selectable. Ordinary meshes expand
 * to edge-connected coplanar triangles.
 *
 * @param mesh Hit mesh (solid result or ordinary geometry).
 * @param seedFaceIndex Clicked triangle index.
 * @returns Triangle indices that form the selectable face unit.
 */
export function expandFaceSelectionIndices(mesh: THREE.Mesh, seedFaceIndex: number): number[] {
  const solidIndices = findSameSolidBrushSurfaceIndicesFast(mesh, seedFaceIndex);
  if (solidIndices) {
    return solidIndices;
  }
  return findConnectedCoplanarFaceIndices(mesh.geometry, seedFaceIndex);
}

/**
 * Returns all result triangles that share the seed's brush id and surface
 * index. When the mesh has solid sources but the seed row is invalid, returns
 * only the seed (never coplanar flood-fill across unrelated brushes).
 *
 * @param mesh Candidate solid result mesh.
 * @param seedFaceIndex Seed triangle.
 * @returns Sorted triangle indices, or null when the mesh is not a solid
 *   result.
 */
export function findSameSolidBrushSurfaceIndices(mesh: THREE.Mesh, seedFaceIndex: number): number[] | null {
  return findSameSolidBrushSurfaceIndicesFast(mesh, seedFaceIndex);
}
