import * as THREE from 'three';
import { FaceSelection } from './face_selection_manager.js';
import { findCoplanarFaceIndices } from './triangle_geometry_utils.js';

/**
 * A distinct coplanar face region on a single mesh, ready for extrusion.
 */
export interface FaceRegion {
  mesh: THREE.Mesh;
  faceIndices: number[];
}

/**
 * Groups selected face triangles into independent coplanar regions.
 * Each region becomes one convex prism when extruded.
 * @param selections The current face selection entries.
 * @returns Ordered face regions (stable per mesh, then by seed face index).
 */
export function groupSelectionsIntoFaceRegions(
  selections: FaceSelection[]
): FaceRegion[] {
  if (selections.length === 0) return [];
  const byMesh = groupSelectionsByMesh(selections);
  const regions: FaceRegion[] = [];
  byMesh.forEach((faceIndices, mesh) => {
    const meshRegions = splitMeshFacesIntoCoplanarRegions(mesh, faceIndices);
    meshRegions.forEach((regionIndices) => {
      regions.push({ mesh, faceIndices: regionIndices });
    });
  });
  return regions;
}

/**
 * Buckets face selections by their owning mesh.
 * @param selections Face selection entries.
 * @returns Map from mesh to selected triangle indices.
 */
function groupSelectionsByMesh(
  selections: FaceSelection[]
): Map<THREE.Mesh, number[]> {
  const byMesh = new Map<THREE.Mesh, number[]>();
  selections.forEach((entry) => {
    const existing = byMesh.get(entry.mesh);
    if (existing) {
      if (!existing.includes(entry.faceIndex)) {
        existing.push(entry.faceIndex);
      }
      return;
    }
    byMesh.set(entry.mesh, [entry.faceIndex]);
  });
  return byMesh;
}

/**
 * Splits selected triangle indices on one mesh into coplanar regions.
 * @param mesh The mesh owning the faces.
 * @param faceIndices Selected triangle indices on that mesh.
 * @returns Arrays of coplanar triangle indices.
 */
function splitMeshFacesIntoCoplanarRegions(
  mesh: THREE.Mesh,
  faceIndices: number[]
): number[][] {
  const remaining = new Set(faceIndices);
  const regions: number[][] = [];
  const sortedSeeds = faceIndices.slice().sort((a, b) => a - b);
  sortedSeeds.forEach((seed) => {
    if (!remaining.has(seed)) return;
    const region = findCoplanarFaceIndices(mesh.geometry, seed).filter((index) =>
      remaining.has(index)
    );
    const finalRegion = region.length > 0 ? region : [seed];
    finalRegion.forEach((index) => remaining.delete(index));
    regions.push(finalRegion.sort((a, b) => a - b));
  });
  return regions;
}
