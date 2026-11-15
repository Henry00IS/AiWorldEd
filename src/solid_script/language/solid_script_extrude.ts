import * as THREE from 'three';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import { solidScriptPolygonConvexPieces } from './solid_script_polygon.js';
import {
  solidScriptShapeJoin,
  solidScriptShapeMapLeaves,
  type SolidScriptShape,
  type SolidScriptShapeSolid,
} from './solid_script_shape.js';

/**
 * Extrudes the 2D polygons of a shape tree along Z the way linear_extrude does;
 * booleans between 2D shapes become booleans between the extruded solids.
 *
 * @param shape 2D shape tree in the extrusion plane.
 * @param args Linear_extrude arguments (height, center, scale, twist).
 * @param matrix Transform applied to the extruded points.
 * @returns 3D shape tree.
 */
export function solidScriptExtrude(
  shape: SolidScriptShape,
  args: SolidScriptBlockArguments,
  matrix: THREE.Matrix4,
): SolidScriptShape {
  const height = args.positive('height', args.number('height', 1));
  const base = args.flag('center') ? -height / 2 : 0;
  const [scaleX, scaleY] = args.vector('scale', [1, 1]) as [number, number];
  return solidScriptShapeMapLeaves(shape, (leaf) => {
    if (leaf.kind === 'solid') throw new Error('only flat shapes (Square, Circle, Polygon) can be extruded');
    const pieces = solidScriptPolygonConvexPieces(leaf.points).map((piece): SolidScriptShapeSolid => ({
      kind: 'solid',
      label: leaf.label,
      points: piece.flatMap(([x, y]) => [
        new THREE.Vector3(x, y, base).applyMatrix4(matrix),
        new THREE.Vector3(x * scaleX, y * scaleY, base + height).applyMatrix4(matrix),
      ]),
    }));
    return solidScriptShapeJoin(pieces, leaf.label) as SolidScriptShape;
  });
}
