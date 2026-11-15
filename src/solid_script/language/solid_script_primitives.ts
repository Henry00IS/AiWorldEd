import * as THREE from 'three';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import type { SolidScriptPoint2 } from './solid_script_polygon.js';
import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

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
 * Points of a circle in the XY plane.
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
 * Corner points of a Cube block.
 *
 * @param args Block fields.
 * @returns Points.
 */
export function solidScriptCubePoints(args: SolidScriptBlockArguments): THREE.Vector3[] {
  const [x, y, z] = solidScriptSizes(args, [1, 1, 1]) as [number, number, number];
  const shift = args.flag('center') ? new THREE.Vector3(-x / 2, -y / 2, -z / 2) : new THREE.Vector3();
  const points: THREE.Vector3[] = [];
  for (const px of [0, x])
    for (const py of [0, y]) for (const pz of [0, z]) points.push(new THREE.Vector3(px, py, pz).add(shift));
  return points;
}

/**
 * Points of a Cylinder block; a top radius of 0 makes a pointed cone.
 *
 * @param args Block fields.
 * @returns Points.
 */
export function solidScriptCylinderPoints(args: SolidScriptBlockArguments): THREE.Vector3[] {
  const height = args.positive('h', args.number('h', 1));
  const bottom = args.number('r1', 1);
  const top = args.number('r2', 1);
  if (bottom < 0) throw args.error('r1', 'must be 0 or more', bottom);
  if (top < 0) throw args.error('r2', 'must be 0 or more', top);
  if (Math.max(bottom, top) <= 0) throw new Error('one of the two radii must be greater than 0');
  const base = args.flag('center') ? -height / 2 : 0;
  const count = solidScriptSides(args);
  const ring = (radius: number, z: number): THREE.Vector3[] =>
    radius < 1e-9
      ? [new THREE.Vector3(0, 0, z)]
      : solidScriptCirclePoints(radius, count).map(([x, y]) => new THREE.Vector3(x, y, z));
  return [...ring(bottom, base), ...ring(top, base + height)];
}

/**
 * Points of a Sphere block: rings stacked from bottom to top, each with the
 * given sides.
 *
 * @param args Block fields.
 * @returns Points.
 */
export function solidScriptSpherePoints(args: SolidScriptBlockArguments): THREE.Vector3[] {
  const radius = args.positive('r', args.number('r', 1));
  const count = solidScriptSides(args);
  const rings = solidScriptCount(args, 'rings', SOLID_SCRIPT_RINGS);
  const points: THREE.Vector3[] = [];
  for (let ring = 0; ring < rings; ring++) {
    const phi = (Math.PI * (ring + 0.5)) / rings;
    for (const [x, y] of solidScriptCirclePoints(radius * Math.sin(phi), count))
      points.push(new THREE.Vector3(x, y, radius * Math.cos(phi)));
  }
  return points;
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
  const listed = solidScriptPointList(args).map((entry) => {
    const xyz = solidScriptValueNumbers(entry);
    if (!xyz || xyz.length !== 3) throw args.error('points', 'must list x, y, z corners', entry);
    return new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
  });
  const points = [...listed, ...gathered];
  if (points.length < 4)
    throw new Error(
      `Polyhedron needs at least 4 corners and has ${points.length}; add Point lines inside it or a list in Points From List`,
    );
  return points;
}

/**
 * Reads the optional Points From List field: empty, one point, or a list of
 * points such as a list variable.
 *
 * @param args Block fields.
 * @returns Point values.
 */
function solidScriptPointList(args: SolidScriptBlockArguments): SolidScriptValue[] {
  const list = args.value('points');
  if (!Array.isArray(list)) throw args.error('points', 'must be a list of points', list ?? 'nothing');
  if (list.length > 0 && typeof list[0] === 'number') return [list];
  return list;
}

/**
 * Corner points of a Square block.
 *
 * @param args Block fields.
 * @returns Points, counter-clockwise.
 */
export function solidScriptSquarePoints(args: SolidScriptBlockArguments): SolidScriptPoint2[] {
  const [x, y] = solidScriptSizes(args, [1, 1]) as [number, number];
  const [sx, sy] = args.flag('center') ? [-x / 2, -y / 2] : [0, 0];
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
  return solidScriptCirclePoints(args.positive('r', args.number('r', 1)), solidScriptSides(args));
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
  const listed = solidScriptPointList(args).map((entry) => {
    const xy = solidScriptValueNumbers(entry);
    if (!xy || xy.length < 2 || xy.length > 3) throw args.error('points', 'must list x, y points', entry);
    return [xy[0], xy[1]] as SolidScriptPoint2;
  });
  const points = [...listed, ...gathered.map((point) => [point.x, point.y] as SolidScriptPoint2)];
  if (points.length < 3)
    throw new Error(
      `Polygon needs at least 3 points and has ${points.length}; add Point lines inside it or a list in Points From List`,
    );
  return points;
}
