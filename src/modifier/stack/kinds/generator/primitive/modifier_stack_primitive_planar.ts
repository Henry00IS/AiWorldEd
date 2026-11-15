import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Builds the planar mapping of one flat face: the editor's upright face basis
 * at one repeat per metre, anchored at a fixed point so coplanar faces of
 * neighbouring pieces continue one texture without a seam.
 *
 * @param normal Unit face normal in frame coordinates.
 * @param anchor Point every planar face measures its texture from.
 * @returns UV matrix.
 */
export function modifierStackPrimitivePlanarUv(normal: THREE.Vector3, anchor: THREE.Vector3): SurfaceUvMatrix {
  const basis = SurfaceUvMatrix.fromTrs(new THREE.Vector2(), normal, 0, 1, 1);
  const u = basis.u.clone();
  const v = basis.v.clone();
  u.w = -(u.x * anchor.x + u.y * anchor.y + u.z * anchor.z);
  v.w = -(v.x * anchor.x + v.y * anchor.y + v.z * anchor.z);
  return new SurfaceUvMatrix(u, v);
}

/**
 * Gives every face of a piece the anchored planar mapping.
 *
 * @param piece Piece in frame coordinates.
 * @param anchor Shared texture anchor, such as the box minimum.
 * @returns Surface per face.
 */
export function modifierStackPrimitivePlanarSurfaces(
  piece: SolidBrush,
  anchor: THREE.Vector3,
): FaceSurfaceDescription[] {
  return piece.planes.map((plane) => ({
    textureId: DEFAULT_CHECKER_TEXTURE_ID,
    uv: modifierStackPrimitivePlanarUv(plane.normal, anchor),
  }));
}
