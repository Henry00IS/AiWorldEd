import * as THREE from 'three';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import type { SolidScriptUseSolid } from '@/solid_script/language/solid_script_system.js';

/**
 * A received brush for tests, from the corners of a convex solid such as a box:
 * the corners keep their order and the faces are those of their hull.
 *
 * @param corners Corners, every one a corner of the solid.
 * @returns Received brush.
 */
export function solidScriptUseSolidOf(corners: readonly (readonly [number, number, number])[]): SolidScriptUseSolid {
  const points = corners.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const brush = solidHullBrushFromPoints(points.map((point) => point.clone()));
  if (!brush) throw new Error('the corners are flat');
  const own = brush.vertices.map((vertex) => points.findIndex((point) => point.distanceTo(vertex) < 1e-9));
  return { corners, faces: brush.faces.map((face) => brush.getFaceVertexIndices(face).map((index) => own[index]!)) };
}
