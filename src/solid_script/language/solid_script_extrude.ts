import { SOLID_SCRIPT_ANCHOR_HEIGHT, solidScriptAnchorMin } from './solid_script_anchor.js';
import * as THREE from 'three';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import { solidScriptPolygonConvexPieces } from './solid_script_polygon.js';
import { SOLID_SCRIPT_AXES_FLAT } from './solid_script_axes.js';
import { solidScriptBodyPrism } from './solid_script_body.js';
import {
  solidScriptShapeJoin,
  solidScriptShapeMapLeaves,
  type SolidScriptShape,
  type SolidScriptShapeSolid,
} from './solid_script_shape.js';
import { solidScriptShapePolygonPoints } from './solid_script_shape.js';

/**
 * Extrudes the 2D polygons of a shape tree the way linear_extrude does: the
 * drawing lies on the ground and is pulled up along Y; booleans between 2D
 * shapes become booleans between the extruded solids.
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
  const [base = 0] = solidScriptAnchorMin([height], args.anchor(SOLID_SCRIPT_ANCHOR_HEIGHT));
  const [scaleX, scaleY] = args.vector('scale', [1, 1]) as [number, number];
  const lift = matrix.clone().multiply(SOLID_SCRIPT_AXES_FLAT);
  return solidScriptShapeMapLeaves(shape, (leaf) => {
    if (leaf.kind !== 'polygon')
      throw new Error('only closed paths (Square, Circle, Polygon or a closed Path) can be extruded');
    const pieces = solidScriptPolygonConvexPieces(solidScriptShapePolygonPoints(leaf)).map(
      (piece): SolidScriptShapeSolid => ({
        kind: 'solid',
        label: leaf.label,
        ...solidScriptBodyPrism(
          piece.map(([x, y]) => new THREE.Vector3(x, y, base).applyMatrix4(lift)),
          piece.map(([x, y]) => new THREE.Vector3(x * scaleX, y * scaleY, base + height).applyMatrix4(lift)),
          leaf.label,
        ),
      }),
    );
    return solidScriptShapeJoin(pieces, leaf.label) as SolidScriptShape;
  });
}
