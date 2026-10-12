import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';

/** Distance at which a corner is still treated as lying on the face plane. */
const PLANAR_FACE_UV_EPSILON = 1e-4;

/**
 * Rewrites corner UVs from the face plane when every corner is coplanar.
 *
 * @param geometry Working geometry.
 * @param face Face whose corner UVs are replaced when the face is planar.
 */
export function refitPlanarWorkingFaceCornerUvs(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): void {
  const plane = planeFromWorkingFace(geometry, face);
  if (!plane || !faceLiesOnPlane(geometry, face, plane)) {
    return;
  }
  writeCornerUvsFromPlane(geometry, face, plane);
}

/**
 * Projects corner UVs onto the face's best-fit plane.
 *
 * @param geometry Working geometry.
 * @param face Face whose corner UVs are replaced.
 */
export function projectWorkingFaceCornerUvs(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): void {
  const plane = planeFromWorkingFace(geometry, face);
  if (!plane) {
    return;
  }
  writeCornerUvsFromPlane(geometry, face, plane);
}

/**
 * Builds a Newell plane from a working face.
 *
 * @param geometry Working geometry.
 * @param face Face to fit.
 * @returns Plane, or null when the face has fewer than three corners.
 */
function planeFromWorkingFace(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): SolidPlane | null {
  const points = collectFacePoints(geometry, face);
  if (points.length < 3) {
    return null;
  }
  return SolidPlane.fromPolygon(points);
}

/**
 * Reads face corners as positions.
 *
 * @param geometry Working geometry.
 * @param face Face to read.
 * @returns Corner positions in loop order.
 */
function collectFacePoints(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const vertexIndex of face.vertexIndices) {
    const position = topologyWorkingVertexRead(geometry, vertexIndex);
    if (position) {
      points.push(position);
    }
  }
  return points;
}

/**
 * Returns whether every corner lies on a plane.
 *
 * @param geometry Working geometry.
 * @param face Face to test.
 * @param plane Plane to test against.
 * @returns True when no corner leaves the plane.
 */
function faceLiesOnPlane(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace, plane: SolidPlane): boolean {
  for (const vertexIndex of face.vertexIndices) {
    const position = topologyWorkingVertexRead(geometry, vertexIndex);
    if (!position) {
      return false;
    }
    if (Math.abs(plane.signedDistance(position)) > PLANAR_FACE_UV_EPSILON) {
      return false;
    }
  }
  return true;
}

/**
 * Projects each corner onto a centered planar UV matrix.
 *
 * @param geometry Working geometry.
 * @param face Face to update.
 * @param plane Face plane used as the UV normal.
 */
function writeCornerUvsFromPlane(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  plane: SolidPlane,
): void {
  const matrix = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0.5, 0.5), plane.normal, 0, 1, 1);
  for (let corner = 0; corner < face.vertexIndices.length; corner++) {
    writeOneCornerUv(geometry, face, corner, matrix);
  }
}

/**
 * Writes one corner UV from a surface matrix.
 *
 * @param geometry Working geometry.
 * @param face Face to update.
 * @param corner Corner index.
 * @param matrix UV matrix.
 */
function writeOneCornerUv(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  corner: number,
  matrix: SurfaceUvMatrix,
): void {
  const vertexIndex = face.vertexIndices[corner];
  if (vertexIndex === undefined) {
    return;
  }
  const position = topologyWorkingVertexRead(geometry, vertexIndex);
  if (!position) {
    return;
  }
  const uv = matrix.project(position);
  face.cornerUvs[corner] = { u: uv.u, v: uv.v };
}
