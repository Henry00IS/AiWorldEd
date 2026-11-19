import * as THREE from 'three';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import {
  SOLID_SCRIPT_GEOMETRY_EPSILON,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';

/**
 * Scales the faces of a brush or mesh about each face's center. A brush stays a
 * brush; a mesh stays a mesh. Stops when a brush would not stay convex.
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
  return leaf.kind === 'solid' ? solidScriptScaleFaceSolid(leaf, points, label) : { ...leaf, points };
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

/**
 * Keeps a scaled brush as a convex solid, or stops when the corners would fold
 * inside the hull.
 *
 * @param leaf Brush.
 * @param points New corners.
 * @param label Command, for messages.
 * @returns Updated brush.
 */
function solidScriptScaleFaceSolid(
  leaf: SolidScriptShapeSolid,
  points: THREE.Vector3[],
  label: string,
): SolidScriptShapeSolid {
  const unique = solidScriptScaleFaceUnique(points);
  const brush = solidHullBrushFromPoints(unique.map((point) => point.clone()));
  if (!brush || unique.some((point) => !solidScriptScaleFaceOnHull(point, brush.vertices)))
    throw new Error(`${label} would not stay convex; use a Factor closer to 1, or scale fewer faces`);
  return { ...leaf, points };
}

/**
 * Drops corners that sit on an earlier corner.
 *
 * @param points Corners.
 * @returns Unique corners.
 */
function solidScriptScaleFaceUnique(points: readonly THREE.Vector3[]): THREE.Vector3[] {
  const unique: THREE.Vector3[] = [];
  for (const point of points)
    if (!unique.some((known) => known.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON)) unique.push(point);
  return unique;
}

/**
 * Tells whether a corner sits on a hull vertex.
 *
 * @param point Corner.
 * @param vertices Hull vertices.
 * @returns True when it does.
 */
function solidScriptScaleFaceOnHull(point: THREE.Vector3, vertices: readonly THREE.Vector3[]): boolean {
  return vertices.some((vertex) => vertex.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON);
}
