import * as THREE from 'three';
import { SOLID_SCRIPT_ANCHOR_FLAT, SOLID_SCRIPT_ANCHOR_SOLID, solidScriptAnchorMin } from './solid_script_anchor.js';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import type { SolidScriptPoint2 } from './solid_script_polygon.js';
import { solidScriptBodyBox, type SolidScriptBody } from './solid_script_body.js';
import {
  solidScriptGeneratorPieceMoved,
  solidScriptGeneratorPieces,
  type SolidScriptGeneratorPiece,
} from './solid_script_generator_pieces.js';

/**
 * Sides of round shapes: default, fewest and most, matching the primitive
 * generators.
 */
export const SOLID_SCRIPT_SIDES = { default: 16, min: 3, max: 64 } as const;

/**
 * Rings of a sphere from bottom to top: default, fewest and most, matching the
 * primitive generators.
 */
export const SOLID_SCRIPT_RINGS = { default: 8, min: 2, max: 32 } as const;

/**
 * Reads a whole count within a range, such as the sides of a cylinder.
 *
 * @param args Block fields.
 * @param key Field key.
 * @param range Default, fewest and most.
 * @returns Count.
 */
function solidScriptCount(
  args: SolidScriptBlockArguments,
  key: string,
  range: { default: number; min: number; max: number },
): number {
  const count = args.number(key, range.default);
  if (!Number.isInteger(count) || count < range.min || count > range.max)
    throw args.error(key, `must be a whole number from ${range.min} to ${range.max}`, count);
  return count;
}

/**
 * Reads the sides of a round shape: faces around its axis.
 *
 * @param args Block fields.
 * @returns Side count.
 */
export function solidScriptSides(args: SolidScriptBlockArguments): number {
  return solidScriptCount(args, 'sides', SOLID_SCRIPT_SIDES);
}

/**
 * Points of a circle in a flat drawing.
 *
 * @param radius Radius.
 * @param count Side count.
 * @returns Points, counter-clockwise.
 */
export function solidScriptCirclePoints(radius: number, count: number): SolidScriptPoint2[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

/**
 * Reads sizes that must all be greater than zero.
 *
 * @param args Block fields.
 * @param fallback Sizes when the field is missing; sets their count.
 * @returns Sizes.
 */
function solidScriptSizes(args: SolidScriptBlockArguments, fallback: number[]): number[] {
  const size = args.vector('size', fallback);
  if (size.some((entry) => !(entry > 0))) throw args.error('size', 'must be greater than 0 on every axis', size);
  return size;
}

/**
 * Corners and faces of a Cube block: the editor's own box.
 *
 * @param args Block fields.
 * @returns Body.
 */
export function solidScriptCubeBody(args: SolidScriptBlockArguments): SolidScriptBody {
  const size = solidScriptSizes(args, [1, 1, 1]) as [number, number, number];
  const min = new THREE.Vector3(...solidScriptAnchorMin(size, args.anchor(SOLID_SCRIPT_ANCHOR_SOLID)));
  return solidScriptBodyBox(min, min.clone().add(new THREE.Vector3(...size)));
}

/**
 * A Cylinder block, built by the Cylinder or Cone generator with its faces and
 * texture mapping; a top radius of 0 makes a pointed cone, and a top wider than
 * the bottom turns the cone over.
 *
 * @param args Block fields.
 * @returns Piece.
 */
export function solidScriptCylinderPiece(args: SolidScriptBlockArguments): SolidScriptGeneratorPiece {
  const height = args.positive('h', args.number('h', 1));
  const bottom = args.number('r1', 1);
  const top = args.number('r2', 1);
  if (bottom < 0) throw args.error('r1', 'must be 0 or more', bottom);
  if (top < 0) throw args.error('r2', 'must be 0 or more', top);
  if (Math.max(bottom, top) <= 0) throw new Error('one of the two radii must be greater than 0');
  const sides = solidScriptSides(args);
  const radius = Math.max(bottom, top);
  const size = [radius * 2, height, radius * 2] as const;
  const min = solidScriptAnchorMin(size, args.anchor(SOLID_SCRIPT_ANCHOR_SOLID)) as [number, number, number];
  if (bottom === top) return solidScriptGeneratorPieces('cylinder', { sides }, { size, min })[0]!;
  const topRadius = Math.min(bottom, top) / radius;
  const piece = solidScriptGeneratorPieces('cone', { sides, topRadius }, { size, min })[0]!;
  return bottom > top ? piece : solidScriptGeneratorPieceMoved(piece, solidScriptCylinderOver(min, size));
}

/**
 * Half a turn about the X axis through the middle of a box, which stands a cone
 * on its point.
 *
 * @param min Lowest corner.
 * @param size Box size.
 * @returns Matrix.
 */
function solidScriptCylinderOver(min: readonly number[], size: readonly number[]): THREE.Matrix4 {
  const middle = new THREE.Vector3(...min).add(new THREE.Vector3(...size).multiplyScalar(0.5));
  return new THREE.Matrix4()
    .makeTranslation(middle)
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(middle.clone().negate()));
}

/**
 * A Sphere block, built by the Sphere generator with its faces and texture
 * mapping: rings stacked from bottom to top, each with the given sides.
 *
 * @param args Block fields.
 * @returns Piece.
 */
export function solidScriptSpherePiece(args: SolidScriptBlockArguments): SolidScriptGeneratorPiece {
  const radius = args.positive('r', args.number('r', 1));
  const sides = solidScriptSides(args);
  const rings = solidScriptCount(args, 'rings', SOLID_SCRIPT_RINGS);
  const size = [radius * 2, radius * 2, radius * 2] as const;
  const min = solidScriptAnchorMin(size, args.anchor(SOLID_SCRIPT_ANCHOR_SOLID)) as [number, number, number];
  return solidScriptGeneratorPieces('sphere', { sides, rings }, { size, min })[0]!;
}

/**
 * Points of a Polyhedron block; the solid becomes their convex hull.
 *
 * @param args Block fields.
 * @returns Points.
 */
export function solidScriptPolyhedronPoints(
  args: SolidScriptBlockArguments,
  gathered: readonly THREE.Vector3[],
): THREE.Vector3[] {
  // The points field already reads x, y, z points.
  const listed = (args.value('points') as number[][]).map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const points = [...listed, ...gathered];
  if (points.length < 4)
    throw new Error(
      `Polyhedron needs at least 4 corners and has ${points.length}; add Point lines inside it or a list in Points From List`,
    );
  return points;
}

/**
 * Corner points of a Square block.
 *
 * @param args Block fields.
 * @returns Points, counter-clockwise.
 */
export function solidScriptSquarePoints(args: SolidScriptBlockArguments): SolidScriptPoint2[] {
  const [x, y] = solidScriptSizes(args, [1, 1]) as [number, number];
  const [sx = 0, sy = 0] = solidScriptAnchorMin([x, y], args.anchor(SOLID_SCRIPT_ANCHOR_FLAT));
  return [
    [sx, sy],
    [sx + x, sy],
    [sx + x, sy + y],
    [sx, sy + y],
  ];
}

/**
 * Outline points of a Circle block.
 *
 * @param args Block fields.
 * @returns Points, counter-clockwise.
 */
export function solidScriptCircleOutline(args: SolidScriptBlockArguments): SolidScriptPoint2[] {
  const radius = args.positive('r', args.number('r', 1));
  const [sx = 0, sy = 0] = solidScriptAnchorMin([radius * 2, radius * 2], args.anchor(SOLID_SCRIPT_ANCHOR_FLAT));
  return solidScriptCirclePoints(radius, solidScriptSides(args)).map(([x, y]) => [x + sx + radius, y + sy + radius]);
}

/**
 * Outline points of a Polygon block.
 *
 * @param args Block fields.
 * @returns Points in outline order.
 */
export function solidScriptPolygonOutline(
  args: SolidScriptBlockArguments,
  gathered: readonly THREE.Vector3[],
): SolidScriptPoint2[] {
  // The points field already reads x, y points.
  const listed = (args.value('points') as number[][]).map(([x, y]) => [x, y] as SolidScriptPoint2);
  const points = [...listed, ...gathered.map((point) => [point.x, point.y] as SolidScriptPoint2)];
  if (points.length < 3)
    throw new Error(
      `Polygon needs at least 3 points and has ${points.length}; add Point lines inside it or a list in Points From List`,
    );
  return points;
}
