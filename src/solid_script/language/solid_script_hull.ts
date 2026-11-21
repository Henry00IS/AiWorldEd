import * as THREE from 'three';
import { solidScriptBodyFromBrush } from './solid_script_body.js';
import { solidScriptHullBrush } from './solid_script_body_hull.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptPolygonHull, type SolidScriptPoint2 } from './solid_script_polygon.js';
import {
  solidScriptShapeLeavesPositive,
  type SolidScriptShape,
  type SolidScriptShapeLeaf,
} from './solid_script_shape.js';
import { solidScriptShapePolygon, solidScriptShapePolygonPoints } from './solid_script_shape.js';

/**
 * Reads the optional Points From List of a Hull: each entry is one x, y, z
 * corner in the Hull's own frame.
 *
 * @param run Running Hull line.
 * @returns Corner points, or none when the field is empty.
 */
export function solidScriptHullListed(run: SolidScriptBlockRun): THREE.Vector3[] {
  const listed = run.value('points') as number[][];
  return listed.map((point) => new THREE.Vector3(point[0], point[1], point[2] ?? 0));
}

/**
 * Builds one convex wrap from the shapes inside a Hull and any extra corners.
 *
 * @param shapes Shapes the lines inside built.
 * @param extra Corner points already in the same frame as those shapes.
 * @param label Name of the wrap, or the command id.
 * @param planar True inside Linear Extrude, where the wrap is a flat outline.
 * @returns One shape, or none when there are no corners.
 */
export function solidScriptHullShapes(
  shapes: readonly SolidScriptShape[],
  extra: readonly THREE.Vector3[],
  label: string,
  planar: boolean,
): SolidScriptShape[] {
  const leaves = shapes.flatMap(solidScriptShapeLeavesPositive);
  return planar ? solidScriptHullOutline(leaves, extra, label) : solidScriptHullSolid(leaves, extra, label);
}

/**
 * Lists the 3D corners of a leaf a Hull can wrap; a flat outline has none.
 *
 * @param leaf Shape leaf.
 * @returns Corners.
 */
function solidScriptHullLeafPoints(leaf: SolidScriptShapeLeaf): THREE.Vector3[] {
  return leaf.kind === 'polygon' ? [] : leaf.points.map((point) => point.clone());
}

/**
 * Builds the flat wrap of a Hull inside Linear Extrude.
 *
 * @param leaves Shapes the lines inside built.
 * @param extra Corner points already in the same frame as those shapes.
 * @param label Name of the wrap, or the command id.
 * @returns One outline, or none when there are no corners.
 */
function solidScriptHullOutline(
  leaves: readonly SolidScriptShapeLeaf[],
  extra: readonly THREE.Vector3[],
  label: string,
): SolidScriptShape[] {
  const points: SolidScriptPoint2[] = [
    ...leaves.flatMap((leaf) => (leaf.kind === 'polygon' ? solidScriptShapePolygonPoints(leaf) : [])),
    ...extra.map((point) => [point.x, point.y] as SolidScriptPoint2),
  ];
  if (points.length === 0) return [];
  if (points.length < 3)
    throw new Error(
      `${label} needs at least 3 points on the drawing and has ${points.length}; add Point lines, a list in Points From List, or a flat shape inside`,
    );
  return [solidScriptShapePolygon(solidScriptPolygonHull(points), label)];
}

/**
 * Builds the solid wrap of a Hull.
 *
 * @param leaves Shapes the lines inside built.
 * @param extra Corner points already in the same frame as those shapes.
 * @param label Name of the wrap, or the command id.
 * @returns One solid, or none when there are no corners.
 */
function solidScriptHullSolid(
  leaves: readonly SolidScriptShapeLeaf[],
  extra: readonly THREE.Vector3[],
  label: string,
): SolidScriptShape[] {
  const points = [...leaves.flatMap(solidScriptHullLeafPoints), ...extra];
  if (points.length === 0) return [];
  const brush = solidScriptHullBrush(points);
  if (!brush)
    throw new Error(
      `${label} needs at least 4 corners that do not all lie in one plane; add Point lines, a list in Points From List, or scatter on more than one face`,
    );
  return [{ kind: 'solid', label, ...solidScriptBodyFromBrush(brush) }];
}
