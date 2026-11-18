import * as THREE from 'three';
import { buildProjectionBasis } from '@/texture/uv/planar_uv_projector.js';
import { fitSurfaceUvMatrixFromWorldSamples } from '@/texture/uv_matrix/surface_uv_matrix_fit.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Maps a point around a cylinder: U is arc length at Radius, V is height along
 * the axis, both in metres over Size.
 *
 * @param point Position.
 * @param axis Unit cylinder axis.
 * @param centre A point on the axis.
 * @param size Metres covered by one texture repeat.
 * @param radius Reference radius in metres; 1 when omitted.
 * @returns U and V.
 */
export function textureUvProjectCylinderPoint(
  point: THREE.Vector3,
  axis: THREE.Vector3,
  centre: THREE.Vector3,
  size: number,
  radius = 1,
): [number, number] {
  const relative = point.clone().sub(centre);
  const along = relative.dot(axis);
  const basis = buildProjectionBasis(axis, 0);
  const around = Math.atan2(relative.dot(basis.vAxis), relative.dot(basis.uAxis));
  return [(around * radius) / size, along / size];
}

/**
 * Maps a point onto a sphere: U is longitude arc at Radius, V is polar arc from
 * the +axis pole, both in metres over Size.
 *
 * @param point Position.
 * @param axis Unit pole axis.
 * @param centre Sphere centre.
 * @param size Metres covered by one texture repeat.
 * @param radius Reference radius in metres; 1 when omitted.
 * @returns U and V.
 */
export function textureUvProjectSpherePoint(
  point: THREE.Vector3,
  axis: THREE.Vector3,
  centre: THREE.Vector3,
  size: number,
  radius = 1,
): [number, number] {
  const relative = point.clone().sub(centre);
  const length = relative.length();
  const basis = buildProjectionBasis(axis, 0);
  const around = Math.atan2(relative.dot(basis.vAxis), relative.dot(basis.uAxis));
  const polar = length <= 1e-12 ? 0 : Math.acos(Math.min(1, Math.max(-1, relative.dot(axis) / length)));
  return [(around * radius) / size, (polar * radius) / size];
}

/**
 * Fits a planar UV matrix to the cylinder or sphere mapping of a face's
 * corners, for a convex brush face.
 *
 * @param corners Face corners in order.
 * @param project Mapping of one point.
 * @returns Fitted matrix, or null when the corners cannot define a plane.
 */
export function textureUvProjectFitFace(
  corners: readonly THREE.Vector3[],
  project: (point: THREE.Vector3) => [number, number],
): SurfaceUvMatrix | null {
  if (corners.length < 3) return null;
  return fitSurfaceUvMatrixFromWorldSamples(
    corners.map((corner) => {
      const [u, v] = project(corner);
      return { world: corner, u, v };
    }),
  );
}
