import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { solidScriptBodyConvex, solidScriptBodySolid } from './solid_script_body.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { solidScriptHullBrush } from './solid_script_body_hull.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';
import { solidScriptShapeNested, type SolidScriptShape, type SolidScriptShapeSolid } from './solid_script_shape.js';

/**
 * Moves the corners of a brush in place. The brush keeps its faces when they
 * still fit, which a quick check tells; when a face bends it is rebuilt, with
 * the editor's brush check, from a hull of the corners. When no hull fits, such
 * as a dent, it keeps its faces and is not convex for now: later lines may move
 * the corners back, and only the finished output is checked.
 *
 * @param leaf Brush before the edit.
 * @param points New corners, one for each old corner.
 * @returns Edited brush.
 */
export function solidScriptSolidEdited(leaf: SolidScriptShapeSolid, points: THREE.Vector3[]): SolidScriptShapeSolid {
  if (solidScriptBodyConvex({ points, faces: leaf.faces })) return { ...leaf, points };
  const brush = solidScriptHullBrush(points);
  const faces = brush ? solidScriptSolidHullFaces(brush, points) : null;
  if (!brush || !faces || !SolidBrushValidator.validate(brush).valid) return { ...leaf, points };
  return { ...leaf, points, faces };
}

/**
 * Counts the brushes in finished output that are not convex, so the scene would
 * not build them: the quick check first, then the editor's own check for
 * generated brushes. Runs once when a script ends, never on each edit.
 *
 * @param shapes Output shapes.
 * @returns How many brushes are not convex.
 */
export function solidScriptShapesNotConvex(shapes: readonly SolidScriptShape[]): number {
  return shapes.reduce((sum, shape) => {
    const nested = solidScriptShapeNested(shape);
    if (nested) return sum + solidScriptShapesNotConvex(nested);
    return shape.kind === 'solid' && !solidScriptSolidBuildable(shape) ? sum + 1 : sum;
  }, 0);
}

/**
 * Tells whether a brush passes the check the scene makes on generated brushes.
 *
 * @param solid Brush.
 * @returns True when it can be built.
 */
export function solidScriptSolidBuildable(solid: SolidScriptShapeSolid): boolean {
  if (solidScriptBodyConvex(solid)) return true;
  if (!solidScriptBodySolid(solid)) return false;
  const brush = SolidBrushFactory.createFromFaceLoops(
    solid.faces.map((loop) => loop.map((index) => solid.points[index]!)),
  );
  return brush !== null && SolidBrushValidator.validateGenerated(brush).valid;
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
