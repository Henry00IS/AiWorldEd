import * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import { SOLID_SCRIPT_AXES_UP, solidScriptAxesHeight } from './solid_script_axes.js';

/** Shortest stretch of a path that counts, in metres. */
const SOLID_SCRIPT_PATH_EPSILON = 1e-9;

/**
 * Drops points that repeat the one before, so every stretch has a direction.
 *
 * @param path Path points.
 * @param closed True when the path loops back to its first point.
 * @returns Distinct points.
 */
export function solidScriptPathDistinct(path: readonly THREE.Vector3[], closed: boolean): THREE.Vector3[] {
  const points = path.filter(
    (point, index) => index === 0 || point.distanceTo(path[index - 1]!) > SOLID_SCRIPT_PATH_EPSILON,
  );
  const first = points[0];
  if (closed && first && points.length > 1 && points[points.length - 1]!.distanceTo(first) <= SOLID_SCRIPT_PATH_EPSILON)
    points.pop();
  return points;
}

/**
 * Picks a side direction square to a direction, for the first stretch.
 *
 * @param direction Unit direction.
 * @returns Unit side.
 */
function solidScriptPathSide(direction: THREE.Vector3): THREE.Vector3 {
  const up =
    Math.abs(solidScriptAxesHeight(direction)) < 0.9 ? SOLID_SCRIPT_AXES_UP.clone() : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(up, direction).normalize();
}

/**
 * Picks the side direction of every stretch: square to its Up when one is
 * given, else carried from the stretch before with as little turn as possible.
 *
 * @param directions Unit direction of each stretch.
 * @param ups For each stretch, the way the profile's up should face, or null.
 * @returns Unit side of each stretch.
 */
function solidScriptPathSides(
  directions: readonly THREE.Vector3[],
  ups: readonly (THREE.Vector3 | null)[],
): THREE.Vector3[] {
  const sides: THREE.Vector3[] = [];
  directions.forEach((direction, index) => {
    const before = sides[index - 1];
    const carried = before
      ? before
          .clone()
          .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(directions[index - 1] ?? direction, direction))
      : solidScriptPathSide(direction);
    const up = ups[index];
    const facing = up ? new THREE.Vector3().crossVectors(up, direction) : null;
    sides.push(facing && facing.lengthSq() > SOLID_SCRIPT_PATH_EPSILON ? facing.normalize() : carried);
  });
  return sides;
}

/**
 * Sweeps a flat profile along a path. Each stretch carries the profile square
 * to its direction, turned as little as possible from the stretch before, and
 * each joint ring lies on the mitre plane between its two stretches, so
 * neighbouring pieces share their joint exactly. Profile x runs to the side of
 * the path and y up; a counter-clockwise profile faces outwards.
 *
 * @param path Path points, at least 2 distinct.
 * @param profile Profile points.
 * @param closed True when the path loops.
 * @param ups For each stretch, the way the profile's up should face, or null to
 *   turn it as little as possible from the stretch before.
 * @returns One ring per path point, plus the first again when closed.
 */
export function solidScriptPathSweep(
  path: readonly THREE.Vector3[],
  profile: readonly THREE.Vector2[],
  closed: boolean,
  ups: readonly (THREE.Vector3 | null)[] = [],
): THREE.Vector3[][] {
  const points = solidScriptPathDistinct(path, closed);
  if (points.length < 2 || (closed && points.length < 3))
    throw new Error(`Path needs at least ${closed ? 3 : 2} different points, not ${points.length}`);
  const stretches = closed ? points.length : points.length - 1;
  const directions = Array.from({ length: stretches }, (_, index) =>
    points[(index + 1) % points.length]!.clone().sub(points[index]!).normalize(),
  );
  const sides = solidScriptPathSides(directions, ups);
  const mitre = (index: number): THREE.Vector3 => {
    const after = directions[Math.min(index, stretches - 1) % stretches]!;
    const before = closed ? directions[(index + stretches - 1) % stretches]! : directions[Math.max(index - 1, 0)]!;
    const normal = before.clone().add(after);
    return normal.lengthSq() > SOLID_SCRIPT_PATH_EPSILON ? normal.normalize() : after.clone();
  };
  const ring = (stretch: number, at: number): THREE.Vector3[] => {
    const direction = directions[stretch]!;
    const side = sides[stretch]!;
    const up = new THREE.Vector3().crossVectors(direction, side);
    const origin = points[at % points.length]!;
    const plane = mitre(at % points.length);
    const along = direction.dot(plane);
    return profile.map((corner) => {
      const offset = side.clone().multiplyScalar(corner.x).addScaledVector(up, corner.y);
      const slide = Math.abs(along) > 1e-6 ? -offset.dot(plane) / along : 0;
      return origin.clone().add(offset).addScaledVector(direction, slide);
    });
  };
  const rings = [ring(0, 0)];
  for (let stretch = 0; stretch < stretches; stretch++) rings.push(ring(stretch, stretch + 1));
  if (closed) {
    // The loop's last stretch is turned by the whole loop; meet the first ring.
    rings[rings.length - 1] = rings[0]!.map((point) => point.clone());
  }
  return rings;
}

/**
 * Builds one mesh from swept rings: a band of four-sided faces between each
 * pair of rings, and, when caps are wanted, a cap at each end of an open path.
 *
 * @param rings Rings from solidScriptPathSweep.
 * @param closed True when the path loops; its last ring repeats the first.
 * @param label Mesh label.
 * @param caps True to close the ends of an open path with a face each.
 * @returns Mesh.
 */
export function solidScriptPathMesh(
  rings: readonly THREE.Vector3[][],
  closed: boolean,
  label: string,
  caps: boolean,
): SolidScriptShapeMesh {
  const used = closed ? rings.slice(0, -1) : rings;
  const size = used[0]?.length ?? 0;
  const points = used.flat().map((point) => point.clone());
  const faces: number[][] = [];
  const bands = closed ? used.length : used.length - 1;
  for (let band = 0; band < bands; band++) {
    const lower = band * size;
    const upper = ((band + 1) % used.length) * size;
    for (let corner = 0; corner < size; corner++) {
      const next = (corner + 1) % size;
      faces.push([lower + corner, lower + next, upper + next, upper + corner]);
    }
  }
  if (!closed && caps) {
    faces.push(Array.from({ length: size }, (_, corner) => size - 1 - corner));
    faces.push(Array.from({ length: size }, (_, corner) => (used.length - 1) * size + corner));
  }
  return { kind: 'mesh', label, points, faces, uvs: faces.map(() => null) };
}

/**
 * Measures a path.
 *
 * @param path Points.
 * @returns Length in metres.
 */
export function solidScriptPathLength(path: readonly number[][]): number {
  let length = 0;
  for (let index = 1; index < path.length; index++) length += solidScriptPathGap(path[index - 1]!, path[index]!);
  return length;
}

/**
 * Distance between two points of any size.
 *
 * @param a First point.
 * @param b Second point.
 * @returns Distance.
 */
function solidScriptPathGap(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(...a.map((value, axis) => value - (b[axis] ?? 0)));
}

/**
 * Spaces points evenly along a path by length, keeping its two ends.
 *
 * @param path Points, at least 2.
 * @param count Points wanted, at least 2.
 * @returns Points.
 */
export function solidScriptPathResample(path: readonly number[][], count: number): number[][] {
  const total = solidScriptPathLength(path);
  return solidScriptPathSample(
    path,
    Array.from({ length: count }, (_, index) => (total * index) / (count - 1)),
  );
}

/**
 * Places points a fixed distance apart along a path from its start, and keeps
 * its end as a last, shorter step when the length does not divide evenly.
 *
 * @param path Points, at least 2.
 * @param step Distance between points, above 0.
 * @returns Points.
 */
export function solidScriptPathResampleEvery(path: readonly number[][], step: number): number[][] {
  const total = solidScriptPathLength(path);
  const whole = Math.floor(total / step + 1e-9);
  const targets = Array.from({ length: whole + 1 }, (_, index) => Math.min(total, index * step));
  if (total - whole * step > 1e-6) targets.push(total);
  return solidScriptPathSample(path, targets);
}

/**
 * Points at rising distances along a path.
 *
 * @param path Points, at least 2.
 * @param targets Distances from the start, smallest first.
 * @returns Points.
 */
function solidScriptPathSample(path: readonly number[][], targets: readonly number[]): number[][] {
  let stretch = 1;
  let walked = 0;
  const gapAt = (at: number): number => solidScriptPathGap(path[at - 1] ?? [], path[at] ?? []);
  return targets.map((target) => {
    while (stretch < path.length - 1 && walked + gapAt(stretch) < target) walked += gapAt(stretch++);
    const a = path[stretch - 1] ?? [];
    const b = path[stretch] ?? [];
    const gap = gapAt(stretch);
    const t = gap > 0 ? Math.min(1, Math.max(0, (target - walked) / gap)) : 0;
    return a.map((value, axis) => value + ((b[axis] ?? 0) - value) * t);
  });
}

/** A point on a path and the way the path faces there. */
interface SolidScriptPathPlace {
  /** Point at that distance along the path. */
  position: number[];
  /** Unit direction of the stretch that holds it. */
  direction: number[];
}

/**
 * Finds the point at a fraction of a path's length, and the way the path faces
 * there. 0 is the first point, 1 is the last.
 *
 * @param path Points, at least 2.
 * @param amount How far along, from 0 to 1.
 * @returns Point and direction.
 */
function solidScriptPathPlace(path: readonly number[][], amount: number, usage: string): SolidScriptPathPlace {
  if (path.length < 2) throw new Error(`${usage} needs at least 2 points`);
  const total = solidScriptPathLength(path);
  const target = Math.min(1, Math.max(0, amount)) * total;
  const at = solidScriptPathReach(path, target);
  const direction = solidScriptPathStretch(path, at.stretch, usage);
  return { position: at.position, direction };
}

/**
 * The point at a fraction of a path's length.
 *
 * @param path Points, at least 2.
 * @param amount How far along, from 0 to 1.
 * @returns Point.
 */
export function solidScriptPathAt(path: readonly number[][], amount: number, usage: string): number[] {
  return solidScriptPathPlace(path, amount, usage).position;
}

/**
 * The way a path faces at a fraction of its length.
 *
 * @param path Points, at least 2.
 * @param amount How far along, from 0 to 1.
 * @returns Unit direction.
 */
export function solidScriptPathDirection(path: readonly number[][], amount: number, usage: string): number[] {
  return solidScriptPathPlace(path, amount, usage).direction;
}

/**
 * Keeps the part of a path from one fraction of its length to another.
 *
 * @param path Points, at least 2.
 * @param start Where the kept part starts, from 0 to 1.
 * @param end Where the kept part ends, from 0 to 1.
 * @returns Points of the kept part.
 */
export function solidScriptPathTrim(path: readonly number[][], start: number, end: number, usage: string): number[][] {
  if (path.length < 2) throw new Error(`${usage} needs at least 2 points`);
  const low = Math.min(1, Math.max(0, Math.min(start, end)));
  const high = Math.min(1, Math.max(0, Math.max(start, end)));
  const total = solidScriptPathLength(path);
  if (total <= SOLID_SCRIPT_PATH_EPSILON || high - low <= SOLID_SCRIPT_PATH_EPSILON)
    throw new Error(`${usage} needs a stretch with some length, so start and end must differ`);
  const from = solidScriptPathReach(path, low * total);
  const to = solidScriptPathReach(path, high * total);
  const middle = path.slice(from.stretch, to.stretch);
  const points = [from.position, ...middle, to.position];
  return start <= end ? points : [...points].reverse();
}

/** A walk along a path to a target length. */
interface SolidScriptPathReached {
  position: number[];
  stretch: number;
}

/**
 * Walks a path up to a length and returns the point and the stretch that holds
 * it, numbered from 1.
 *
 * @param path Points, at least 2.
 * @param target Length from the start, in metres.
 * @returns Point and stretch.
 */
function solidScriptPathReach(path: readonly number[][], target: number): SolidScriptPathReached {
  let walked = 0;
  for (let stretch = 1; stretch < path.length; stretch++) {
    const a = path[stretch - 1];
    const b = path[stretch];
    if (!a || !b) continue;
    const gap = solidScriptPathGap(a, b);
    if (walked + gap >= target || stretch === path.length - 1) {
      const t = gap > 0 ? Math.min(1, Math.max(0, (target - walked) / gap)) : 0;
      return { position: a.map((value, axis) => value + ((b[axis] ?? 0) - value) * t), stretch };
    }
    walked += gap;
  }
  const last = path[path.length - 1];
  return { position: last ? [...last] : [], stretch: Math.max(1, path.length - 1) };
}

/**
 * Unit direction of one stretch, or a neighbour when that stretch has no
 * length.
 *
 * @param path Points.
 * @param stretch Stretch number, from 1.
 * @returns Unit direction.
 */
function solidScriptPathStretch(path: readonly number[][], stretch: number, usage: string): number[] {
  for (const at of [stretch, stretch - 1, ...Array.from({ length: path.length - 1 }, (_, index) => index + 1)]) {
    const a = path[at - 1];
    const b = path[at];
    if (!a || !b) continue;
    const direction = a.map((value, axis) => (b[axis] ?? 0) - value);
    const size = Math.hypot(...direction);
    if (size > SOLID_SCRIPT_PATH_EPSILON) return direction.map((value) => value / size);
  }
  throw new Error(`${usage} needs a length, so its points must not all sit in the same place`);
}
