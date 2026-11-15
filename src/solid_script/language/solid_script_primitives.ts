import * as THREE from 'three';
import type { SolidScriptCallArguments } from './solid_script_call_arguments.js';
import type { SolidScriptPoint2 } from './solid_script_polygon.js';
import { solidScriptValueNumbers } from './solid_script_value.js';

/** Resolution settings of curved primitives ($fn, $fa, $fs). */
export interface SolidScriptFragmentSettings {
  fn: number;
  fa: number;
  fs: number;
}

/** Most fragments one circle may use. */
const SOLID_SCRIPT_FRAGMENTS_MAX = 128;

/**
 * Number of circle fragments from $fn, $fa and $fs.
 *
 * @param radius Circle radius.
 * @param settings Resolution settings.
 * @returns Fragment count.
 */
export function solidScriptFragments(radius: number, settings: SolidScriptFragmentSettings): number {
  if (radius < 1e-6) return 3;
  if (settings.fn > 0) return Math.min(SOLID_SCRIPT_FRAGMENTS_MAX, Math.max(3, Math.floor(settings.fn)));
  const count = Math.ceil(Math.max(Math.min(360 / settings.fa, (radius * 2 * Math.PI) / settings.fs), 5));
  return Math.min(SOLID_SCRIPT_FRAGMENTS_MAX, count);
}

/**
 * Points of a circle in the XY plane.
 *
 * @param radius Radius.
 * @param settings Resolution settings.
 * @returns Points, counter-clockwise.
 */
export function solidScriptCirclePoints(radius: number, settings: SolidScriptFragmentSettings): SolidScriptPoint2[] {
  const count = solidScriptFragments(radius, settings);
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

/**
 * Reads a radius from r or d arguments.
 *
 * @param args Call arguments.
 * @param radiusName Radius argument name.
 * @param diameterName Diameter argument name.
 * @param fallback Radius when neither is given.
 * @returns Radius.
 */
export function solidScriptRadius(
  args: SolidScriptCallArguments,
  radiusName: string,
  diameterName: string,
  fallback: number,
): number {
  const diameter = args.number(diameterName, -1, NaN);
  return Number.isNaN(diameter) ? args.number(radiusName, -1, fallback) : diameter / 2;
}

/**
 * Corner points of cube(size, center).
 *
 * @param args Call arguments.
 * @returns Points.
 */
export function solidScriptCubePoints(args: SolidScriptCallArguments): THREE.Vector3[] {
  const [x, y, z] = args.vector('size', 0, [1, 1, 1]) as [number, number, number];
  const shift = args.flag('center', 1) ? new THREE.Vector3(-x / 2, -y / 2, -z / 2) : new THREE.Vector3();
  const points: THREE.Vector3[] = [];
  for (const px of [0, x])
    for (const py of [0, y]) for (const pz of [0, z]) points.push(new THREE.Vector3(px, py, pz).add(shift));
  return points;
}

/**
 * Points of cylinder(h, r1, r2, center), with r, d, d1 and d2 forms.
 *
 * @param args Call arguments.
 * @param settings Resolution settings.
 * @returns Points.
 */
export function solidScriptCylinderPoints(
  args: SolidScriptCallArguments,
  settings: SolidScriptFragmentSettings,
): THREE.Vector3[] {
  const height = args.number('h', 0, 1);
  const radius = solidScriptRadius(args, 'r', 'd', 1);
  const bottom = solidScriptRadius(args, 'r1', 'd1', args.number('r1', 1, radius));
  const top = solidScriptRadius(args, 'r2', 'd2', args.number('r2', 2, radius));
  const base = args.flag('center', 3) ? -height / 2 : 0;
  const count = solidScriptFragments(Math.max(bottom, top), settings);
  const ring = (ringRadius: number, z: number): THREE.Vector3[] =>
    ringRadius < 1e-9
      ? [new THREE.Vector3(0, 0, z)]
      : Array.from({ length: count }, (_, index) => {
          const angle = (2 * Math.PI * index) / count;
          return new THREE.Vector3(ringRadius * Math.cos(angle), ringRadius * Math.sin(angle), z);
        });
  return [...ring(bottom, base), ...ring(top, base + height)];
}

/**
 * Points of sphere(r) as stacked rings as stacked rings.
 *
 * @param args Call arguments.
 * @param settings Resolution settings.
 * @returns Points.
 */
export function solidScriptSpherePoints(
  args: SolidScriptCallArguments,
  settings: SolidScriptFragmentSettings,
): THREE.Vector3[] {
  const radius = Number.isNaN(args.number('d', -1, NaN)) ? args.number('r', 0, 1) : args.number('d', -1, 2) / 2;
  const count = solidScriptFragments(radius, settings);
  const rings = Math.floor((count + 1) / 2);
  const points: THREE.Vector3[] = [];
  for (let ring = 0; ring < rings; ring++) {
    const phi = (Math.PI * (ring + 0.5)) / rings;
    for (const [x, y] of solidScriptCirclePoints(radius * Math.sin(phi), { ...settings, fn: count }))
      points.push(new THREE.Vector3(x, y, radius * Math.cos(phi)));
  }
  return points;
}

/**
 * Points of polyhedron(points, faces); the solid becomes their convex hull.
 *
 * @param args Call arguments.
 * @returns Points.
 */
export function solidScriptPolyhedronPoints(args: SolidScriptCallArguments): THREE.Vector3[] {
  const list = args.value('points', 0);
  if (!Array.isArray(list) || list.length < 4)
    throw new Error('polyhedron(): points needs at least 4 [x, y, z] entries');
  return list.map((entry) => {
    const xyz = solidScriptValueNumbers(entry);
    if (!xyz || xyz.length < 3) throw new Error('polyhedron(): every point must be [x, y, z]');
    return new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
  });
}

/**
 * Corner points of square(size, center).
 *
 * @param args Call arguments.
 * @returns Points, counter-clockwise.
 */
export function solidScriptSquarePoints(args: SolidScriptCallArguments): SolidScriptPoint2[] {
  const [x, y] = args.vector('size', 0, [1, 1]) as [number, number];
  const [sx, sy] = args.flag('center', 1) ? [-x / 2, -y / 2] : [0, 0];
  return [
    [sx, sy],
    [sx + x, sy],
    [sx + x, sy + y],
    [sx, sy + y],
  ];
}

/**
 * Outlines of polygon(points, paths): the first path is the outline, later
 * paths are holes.
 *
 * @param args Call arguments.
 * @returns Outline followed by holes.
 */
export function solidScriptPolygonPaths(args: SolidScriptCallArguments): SolidScriptPoint2[][] {
  const list = args.value('points', 0);
  if (!Array.isArray(list) || list.length < 3) throw new Error('polygon(): points needs at least 3 [x, y] entries');
  const points = list.map((entry) => {
    const xy = solidScriptValueNumbers(entry);
    if (!xy || xy.length < 2) throw new Error('polygon(): every point must be [x, y]');
    return [xy[0], xy[1]] as SolidScriptPoint2;
  });
  const paths = args.value('paths', 1);
  if (!Array.isArray(paths)) return [points];
  return paths.map((path) => (solidScriptValueNumbers(path) ?? []).map((index) => points[index] ?? [0, 0]));
}
