import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { solidScriptBodyConvex } from './solid_script_body.js';
import { solidScriptHullBrush } from './solid_script_body_hull.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';
import type { SolidScriptShapeSolid } from './solid_script_shape.js';

/**
 * Moves the corners of a brush in place and stops when they no longer make a
 * convex brush. The brush keeps its faces when they still fit, which a quick
 * check tells; only when a face bends is it rebuilt, with the editor's brush
 * check, from a hull of the corners.
 *
 * @param leaf Brush before the edit.
 * @param points New corners, one for each old corner.
 * @param label Command or line, for the message.
 * @returns Edited brush.
 */
export function solidScriptSolidEdited(
  leaf: SolidScriptShapeSolid,
  points: THREE.Vector3[],
  label: string,
): SolidScriptShapeSolid {
  if (solidScriptBodyConvex({ points, faces: leaf.faces })) return { ...leaf, points };
  const brush = solidScriptHullBrush(points);
  const faces = brush ? solidScriptSolidHullFaces(brush, points) : null;
  if (!brush || !faces || !SolidBrushValidator.validate(brush).valid)
    throw new Error(`${label} is no longer a convex brush`);
  return { ...leaf, points, faces };
}

/**
 * Faces of a hull, numbered by the corners they came from; none when a corner
 * is not one of the hull's own corners, so it would sit inside or on a face.
 *
 * @param brush Hull of the corners.
 * @param points Corners.
 * @returns Face loops, or null.
 */
function solidScriptSolidHullFaces(brush: SolidBrush, points: readonly THREE.Vector3[]): number[][] | null {
  const own = brush.vertices.map((vertex) =>
    points.findIndex((point) => point.distanceTo(vertex) <= SOLID_SCRIPT_GEOMETRY_EPSILON),
  );
  const used = points.every((point) =>
    brush.vertices.some((vertex) => vertex.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON),
  );
  if (!used || own.some((index) => index < 0)) return null;
  return brush.faces.map((face) => brush.getFaceVertexIndices(face).map((index) => own[index]!));
}
