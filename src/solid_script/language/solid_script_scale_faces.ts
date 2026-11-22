import * as THREE from 'three';
import { solidScriptSolidEdited } from './solid_script_solid_validate.js';
import {
  SOLID_SCRIPT_GEOMETRY_EPSILON,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';

/**
 * How one face is scaled: by Factor about Center, in every direction or, when
 * Axis is given, only along it.
 */
export interface SolidScriptScaleFaceHow {
  factor: number;
  center: THREE.Vector3;
  axis: THREE.Vector3 | null;
}

/**
 * Scales the faces of a brush or mesh, each about its own center. A brush stays
 * a brush, convex or not until the output is checked; a mesh stays a mesh.
 *
 * @param leaf Brush or mesh.
 * @param faces Faces of that leaf to scale.
 * @param howOf How each face is scaled.
 * @param label Command, for messages.
 * @returns Updated leaf.
 */
export function solidScriptScaleFaces(
  leaf: SolidScriptGeometryLeaf,
  faces: readonly SolidScriptFaceFacts[],
  howOf: (face: SolidScriptFaceFacts) => SolidScriptScaleFaceHow,
  label: string,
): SolidScriptGeometryLeaf {
  const hows = new Map(faces.map((face) => [face, howOf(face)]));
  for (const how of hows.values())
    if (!Number.isFinite(how.factor)) throw new Error(`${label} needs a Factor, such as 1 or 0.5, not ${how.factor}`);
  const points = leaf.points.map((point) => solidScriptScaleFacePoint(point, hows));
  return leaf.kind === 'solid' ? solidScriptSolidEdited(leaf, points) : { ...leaf, points };
}

/**
 * Moves one corner: the average of scaling it the way of each selected face
 * that holds it, or the same point when no selected face holds it.
 *
 * @param point Corner.
 * @param hows Faces being scaled and how.
 * @returns New position.
 */
function solidScriptScaleFacePoint(
  point: THREE.Vector3,
  hows: ReadonlyMap<SolidScriptFaceFacts, SolidScriptScaleFaceHow>,
): THREE.Vector3 {
  const moved = [...hows].flatMap(([face, how]) => {
    if (!face.corners.some((corner) => corner.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON)) return [];
    return [solidScriptScaleFaceMove(point, how)];
  });
  if (moved.length === 0) return point.clone();
  return moved.reduce((sum, next) => sum.add(next), new THREE.Vector3()).divideScalar(moved.length);
}

/**
 * Scales one point by Factor about Center, only along Axis when one is given.
 *
 * @param point Point.
 * @param how Factor, Center and Axis.
 * @returns Scaled point.
 */
function solidScriptScaleFaceMove(point: THREE.Vector3, how: SolidScriptScaleFaceHow): THREE.Vector3 {
  const offset = point.clone().sub(how.center);
  if (!how.axis) return how.center.clone().addScaledVector(offset, how.factor);
  return point.clone().addScaledVector(how.axis, offset.dot(how.axis) * (how.factor - 1));
}
