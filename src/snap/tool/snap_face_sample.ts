import * as THREE from 'three';
import { getTriangleVertexIndices } from '@/selection/pick/utils_triangle_geometry.js';
import type { FacePickResult } from '@/selection/face/raycaster_face_selection.js';
import { readMeshWorldVertex } from '@/snap/source/snap_mesh_world_vertex.js';

/** Face chosen as a snap-align source or target. */
export interface SnapFaceSample {
  mesh: THREE.Mesh;
  root: THREE.Object3D;
  faceIndex: number;
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  tangent: THREE.Vector3;
  point: THREE.Vector3;
  corners: readonly THREE.Vector3[];
}

/** Three world vertices of a picked triangle. */
interface PickTriangle {
  first: THREE.Vector3;
  second: THREE.Vector3;
  third: THREE.Vector3;
}

/**
 * Builds a face sample from a face pick.
 *
 * @param pick Face pick.
 * @returns Sample, or null when the triangle cannot be read.
 */
export function snapFaceSampleFromPick(pick: FacePickResult): SnapFaceSample | null {
  const triangle = readPickTriangle(pick);
  if (!triangle) {
    return null;
  }
  return faceSampleFromTriangle(pick, triangle);
}

/**
 * Reads the three world vertices of a picked triangle.
 *
 * @param pick Face pick.
 * @returns Triangle, or null when a vertex cannot be read.
 */
function readPickTriangle(pick: FacePickResult): PickTriangle | null {
  const indices = getTriangleVertexIndices(pick.mesh.geometry, pick.faceIndex);
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  pick.mesh.updateMatrixWorld(true);
  if (!readAllPickVertices(pick.mesh, indices, first, second, third)) {
    return null;
  }
  return { first, second, third };
}

/**
 * Reads three indexed vertices into the supplied vectors.
 *
 * @param mesh Mesh that owns the vertices.
 * @param indices Triangle vertex indices.
 * @param first First vertex.
 * @param second Second vertex.
 * @param third Third vertex.
 * @returns True when every vertex was read.
 */
function readAllPickVertices(
  mesh: THREE.Mesh,
  indices: readonly [number, number, number],
  first: THREE.Vector3,
  second: THREE.Vector3,
  third: THREE.Vector3,
): boolean {
  if (!readMeshWorldVertex(mesh, indices[0], first)) {
    return false;
  }
  if (!readMeshWorldVertex(mesh, indices[1], second)) {
    return false;
  }
  return readMeshWorldVertex(mesh, indices[2], third);
}

/**
 * Copies a picked triangle into a face sample.
 *
 * @param pick Face pick.
 * @param triangle World vertices of that triangle.
 * @returns Face sample.
 */
function faceSampleFromTriangle(pick: FacePickResult, triangle: PickTriangle): SnapFaceSample {
  return {
    mesh: pick.mesh,
    root: pick.mesh,
    faceIndex: pick.faceIndex,
    normal: pick.faceNormal.clone(),
    centroid: triangleCentroid(triangle),
    tangent: triangle.second.clone().sub(triangle.first),
    point: pick.hitPoint.clone(),
    corners: [triangle.first.clone(), triangle.second.clone(), triangle.third.clone()],
  };
}

/**
 * Returns the average of a triangle's vertices.
 *
 * @param triangle World vertices.
 * @returns Centroid.
 */
function triangleCentroid(triangle: PickTriangle): THREE.Vector3 {
  return triangle.first
    .clone()
    .add(triangle.second)
    .add(triangle.third)
    .multiplyScalar(1 / 3);
}
