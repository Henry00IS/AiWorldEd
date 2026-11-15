import * as THREE from 'three';
import type { ScadCallArguments } from './scad_call_arguments.js';
import { scadPolygonConvexPieces } from './scad_polygon.js';
import { scadShapeJoin, scadShapeMapLeaves, type ScadShape, type ScadShapeSolid } from './scad_shape.js';

/**
 * Extrudes the 2D polygons of a shape tree along Z the way linear_extrude does;
 * booleans between 2D shapes become booleans between the extruded solids.
 *
 * @param shape 2D shape tree in the extrusion plane.
 * @param args Linear_extrude arguments (height, center, scale, twist).
 * @param matrix Transform applied to the extruded points.
 * @returns 3D shape tree.
 */
export function scadExtrude(shape: ScadShape, args: ScadCallArguments, matrix: THREE.Matrix4): ScadShape {
  if (Math.abs(args.number('twist', -1, 0)) > 1e-9)
    throw new Error('linear_extrude(): twist is not supported; build the twist from rotated slices instead');
  const height = args.number('height', 0, 1);
  const base = args.flag('center', 1) ? -height / 2 : 0;
  const [scaleX, scaleY] = args.vector('scale', -1, [1, 1]) as [number, number];
  return scadShapeMapLeaves(shape, (leaf) => {
    if (leaf.kind === 'solid')
      throw new Error('linear_extrude(): children must be 2D shapes (square, circle, polygon)');
    const pieces = scadPolygonConvexPieces(leaf.points).map((piece): ScadShapeSolid => ({
      kind: 'solid',
      label: leaf.label,
      points: piece.flatMap(([x, y]) => [
        new THREE.Vector3(x, y, base).applyMatrix4(matrix),
        new THREE.Vector3(x * scaleX, y * scaleY, base + height).applyMatrix4(matrix),
      ]),
    }));
    return scadShapeJoin(pieces, leaf.label) as ScadShape;
  });
}
