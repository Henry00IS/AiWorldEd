import * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';

/** Shortest stretch of a path that counts, in metres. */
const SOLID_SCRIPT_PATH_EPSILON = 1e-9;

/**
 * Drops points that repeat the one before, so every stretch has a direction.
 *
 * @param path Path points.
 * @param closed True when the path loops back to its first point.
 * @returns Distinct points.
 */
function solidScriptPathDistinct(path: readonly THREE.Vector3[], closed: boolean): THREE.Vector3[] {
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
  const up = Math.abs(direction.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(up, direction).normalize();
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
 * @returns One ring per path point, plus the first again when closed.
 */
export function solidScriptPathSweep(
  path: readonly THREE.Vector3[],
  profile: readonly THREE.Vector2[],
  closed: boolean,
): THREE.Vector3[][] {
  const points = solidScriptPathDistinct(path, closed);
  if (points.length < 2 || (closed && points.length < 3))
    throw new Error(`Path needs at least ${closed ? 3 : 2} different points, not ${points.length}`);
  const stretches = closed ? points.length : points.length - 1;
  const directions = Array.from({ length: stretches }, (_, index) =>
    points[(index + 1) % points.length]!.clone().sub(points[index]!).normalize(),
  );
  const sides: THREE.Vector3[] = [solidScriptPathSide(directions[0]!)];
  for (let index = 1; index < stretches; index++) {
    const turn = new THREE.Quaternion().setFromUnitVectors(directions[index - 1]!, directions[index]!);
    sides.push(sides[index - 1]!.clone().applyQuaternion(turn));
  }
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
 * pair of rings, and a cap at each end of an open path.
 *
 * @param rings Rings from solidScriptPathSweep.
 * @param closed True when the path loops; its last ring repeats the first.
 * @param label Mesh label.
 * @returns Mesh.
 */
export function solidScriptPathMesh(
  rings: readonly THREE.Vector3[][],
  closed: boolean,
  label: string,
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
  if (!closed) {
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
  const result: number[][] = [];
  let stretch = 1;
  let walked = 0;
  for (let index = 0; index < count; index++) {
    const target = (total * index) / (count - 1);
    while (stretch < path.length - 1 && walked + solidScriptPathGap(path[stretch - 1]!, path[stretch]!) < target) {
      walked += solidScriptPathGap(path[stretch - 1]!, path[stretch]!);
      stretch++;
    }
    const a = path[stretch - 1]!;
    const b = path[stretch]!;
    const gap = solidScriptPathGap(a, b);
    const t = gap > 0 ? Math.min(1, Math.max(0, (target - walked) / gap)) : 0;
    result.push(a.map((value, axis) => value + ((b[axis] ?? 0) - value) * t));
  }
  return result;
}
