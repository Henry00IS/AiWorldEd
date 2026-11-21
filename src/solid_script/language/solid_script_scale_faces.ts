import * as THREE from 'three';
import { solidScriptSolidEdited } from './solid_script_solid_validate.js';
import {
  SOLID_SCRIPT_GEOMETRY_EPSILON,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';

/**
 * Scales the faces of a brush or mesh about each face's center. A brush stays a
 * brush, convex or not until the output is checked; a mesh stays a mesh.
 *
 * @param leaf Brush or mesh.
 * @param faces Faces of that leaf to scale.
 * @param factor Scale about each face center; 1 leaves the face as it is.
 * @param label Command, for messages.
 * @returns Updated leaf.
 */
export function solidScriptScaleFaces(
  leaf: SolidScriptGeometryLeaf,
  faces: readonly SolidScriptFaceFacts[],
  factor: number,
  label: string,
): SolidScriptGeometryLeaf {
  if (!Number.isFinite(factor)) throw new Error(`${label} needs a Factor, such as 1 or 0.5, not ${factor}`);
  const points = leaf.points.map((point) => solidScriptScaleFacePoint(point, faces, factor));
  return leaf.kind === 'solid' ? solidScriptSolidEdited(leaf, points) : { ...leaf, points };
}

/**
 * Moves one corner: the average of scaling it about each selected face that
 * holds it, or the same point when no selected face holds it.
 *
 * @param point Corner.
 * @param faces Faces being scaled.
 * @param factor Scale about each face center.
 * @returns New position.
 */
function solidScriptScaleFacePoint(
  point: THREE.Vector3,
  faces: readonly SolidScriptFaceFacts[],
  factor: number,
): THREE.Vector3 {
  const moved = faces.flatMap((face) => {
    if (!face.corners.some((corner) => corner.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON)) return [];
    return [face.center.clone().addScaledVector(point.clone().sub(face.center), factor)];
  });
  if (moved.length === 0) return point.clone();
  return moved.reduce((sum, next) => sum.add(next), new THREE.Vector3()).divideScalar(moved.length);
}
