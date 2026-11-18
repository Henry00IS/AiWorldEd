import * as THREE from 'three';
import { buildProjectionBasis } from '@/texture/uv/planar_uv_projector.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Builds a planar UV matrix aimed along a projection normal, using the same
 * stable U/V basis as the editor's face projection.
 *
 * @param normal Unit projection normal.
 * @param size Metres covered by one texture repeat.
 * @param origin Point that maps to UV (0, 0); the world origin when omitted.
 * @param rotationDeg Rotation around the normal in degrees.
 * @returns UV matrix in the same space as the point and origin.
 */
export function textureUvProjectPlanar(
  normal: THREE.Vector3,
  size: number,
  origin = new THREE.Vector3(),
  rotationDeg = 0,
): SurfaceUvMatrix {
  const basis = buildProjectionBasis(normal, rotationDeg);
  return new SurfaceUvMatrix(
    textureUvProjectBasisRow(basis.uAxis, size, origin),
    textureUvProjectBasisRow(basis.vAxis, size, origin),
  );
}

/**
 * Builds one UV row along a unit axis.
 *
 * @param axis Unit U or V axis.
 * @param size Metres covered by one texture repeat.
 * @param origin Point that maps to 0 on this row.
 * @returns UV row.
 */
function textureUvProjectBasisRow(axis: THREE.Vector3, size: number, origin: THREE.Vector3): THREE.Vector4 {
  const scale = 1 / size;
  return new THREE.Vector4(axis.x * scale, axis.y * scale, axis.z * scale, -axis.dot(origin) * scale);
}
