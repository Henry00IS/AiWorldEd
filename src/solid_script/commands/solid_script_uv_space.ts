import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { solidScriptBodyBrush } from '@/solid_script/language/solid_script_body.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';

/** Least alignment of a face's direction with a brush face to count as it. */
const SOLID_SCRIPT_UV_SPACE_ALIGN = 0.999;

/** Farthest a face's middle may be from a brush face, in the space's units. */
const SOLID_SCRIPT_UV_SPACE_GAP = 1e-4;

/** Texture of the faces of one solid, worked out in a space of its own. */
export type SolidScriptUvSpaceLookup = (face: SolidScriptFaceFacts) => SurfaceUvMatrix | null;

/**
 * Moves the corners of a solid or mesh into a space, such as one with its axis
 * upright.
 *
 * @param leaf Solid or mesh in script space.
 * @param matrix From script space into the space.
 * @returns Corners in the space.
 */
export function solidScriptUvSpacePoints(leaf: { points: THREE.Vector3[] }, matrix: THREE.Matrix4): THREE.Vector3[] {
  return leaf.points.map((point) => point.clone().applyMatrix4(matrix));
}

/**
 * Builds a solid as a brush in a space, lets a built-in generator's texture
 * rule map its faces there, and gives back each face's mapping in script
 * space.
 *
 * @param leaf Solid in script space.
 * @param matrix From script space into the space; it may only move, turn and
 *   scale evenly.
 * @param surfaces The rule: one surface per brush face, in the space.
 * @returns Mapping of a face of the solid, or null when the rule left it.
 */
export function solidScriptUvSpaceSurfaces(
  leaf: SolidScriptShapeSolid,
  matrix: THREE.Matrix4,
  surfaces: (brush: SolidBrush) => readonly (FaceSurfaceDescription | undefined)[],
): SolidScriptUvSpaceLookup {
  const brush = solidScriptBodyBrush({ points: solidScriptUvSpacePoints(leaf, matrix), faces: leaf.faces }, leaf.label);
  const mapped = surfaces(brush);
  const normals = new THREE.Matrix3().getNormalMatrix(matrix);
  return (face) => {
    const index = solidScriptUvSpaceFace(
      brush,
      face.center.clone().applyMatrix4(matrix),
      face.normal.clone().applyMatrix3(normals).normalize(),
    );
    const uv = index < 0 ? undefined : mapped[index]?.uv;
    return uv ? uv.multiplyMatrix4(matrix) : null;
  };
}

/**
 * Finds the brush face whose plane holds a point and looks the same way.
 *
 * @param brush Brush.
 * @param point Middle of the face.
 * @param normal Unit direction the face looks.
 * @returns Face index, or -1.
 */
function solidScriptUvSpaceFace(brush: SolidBrush, point: THREE.Vector3, normal: THREE.Vector3): number {
  return brush.planes.findIndex(
    (plane) =>
      plane.normal.dot(normal) >= SOLID_SCRIPT_UV_SPACE_ALIGN &&
      Math.abs(plane.signedDistance(point)) <= SOLID_SCRIPT_UV_SPACE_GAP,
  );
}
