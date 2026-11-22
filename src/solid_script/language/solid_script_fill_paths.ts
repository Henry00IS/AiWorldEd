import * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import { solidScriptPathFrame } from './solid_script_path_shape.js';

/** A closed loop laid flat in the fill plane, with its points in space. */
interface SolidScriptFillRing {
  points: THREE.Vector3[];
  flat: THREE.Vector2[];
  area: number;
}

/**
 * Fills closed loops with triangles, the way a floor plan is filled: a loop
 * inside one other loop is a hole, one inside two is filled again, and so on.
 * Every loop is laid flat in the plane of the biggest one.
 *
 * @param loops Closed loops, each at least 3 points.
 * @param label Command, for messages.
 * @returns Mesh of triangles facing the way the biggest loop runs round.
 */
export function solidScriptFillPaths(loops: readonly THREE.Vector3[][], label: string): SolidScriptShapeMesh {
  const usable = loops.map(solidScriptFillOpen).filter((loop) => loop.length >= 3);
  if (usable.length === 0) throw new Error(`${label} needs a closed path with at least 3 points`);
  const normal = usable
    .map(solidScriptFillNewell)
    .reduce((best, next) => (next.length() > best.length() ? next : best));
  if (normal.lengthSq() <= 1e-18) throw new Error(`${label} needs paths that enclose some area`);
  const frame = solidScriptPathFrame(normal, label);
  const rings = usable.map((points): SolidScriptFillRing => {
    const flat = points.map((point) => new THREE.Vector2(point.dot(frame.x), point.dot(frame.y)));
    return { points, flat, area: Math.abs(THREE.ShapeUtils.area(flat)) };
  });
  const mesh: SolidScriptShapeMesh = { kind: 'mesh', label: 'mesh', points: [], faces: [], uvs: [] };
  rings.forEach((ring) => {
    const depth = solidScriptFillDepth(ring, rings);
    if (depth % 2 === 0) solidScriptFillOne(mesh, ring, solidScriptFillHoles(ring, depth, rings));
  });
  return mesh;
}

/**
 * Counts the loops that hold a loop inside them.
 *
 * @param ring Loop.
 * @param rings Every loop.
 * @returns How many hold it.
 */
function solidScriptFillDepth(ring: SolidScriptFillRing, rings: readonly SolidScriptFillRing[]): number {
  return rings.filter((other) => other !== ring && solidScriptFillHolds(other, ring)).length;
}

/**
 * The holes of a filled loop: loops just one level inside it.
 *
 * @param ring Filled loop.
 * @param depth How many loops hold it.
 * @param rings Every loop.
 * @returns Holes.
 */
function solidScriptFillHoles(
  ring: SolidScriptFillRing,
  depth: number,
  rings: readonly SolidScriptFillRing[],
): SolidScriptFillRing[] {
  return rings.filter(
    (other) => other !== ring && solidScriptFillHolds(ring, other) && solidScriptFillDepth(other, rings) === depth + 1,
  );
}

/**
 * Tells whether a loop lies inside another, by its first point, and the other
 * is the bigger one.
 *
 * @param outer Loop that may hold it.
 * @param inner Loop.
 * @returns True when inside.
 */
function solidScriptFillHolds(outer: SolidScriptFillRing, inner: SolidScriptFillRing): boolean {
  const point = inner.flat[0];
  if (!point || outer.area <= inner.area) return false;
  let inside = false;
  outer.flat.forEach((a, index) => {
    const b = outer.flat[(index + outer.flat.length - 1) % outer.flat.length] ?? a;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  });
  return inside;
}

/**
 * Adds the triangles of one filled loop with its holes, each turned to face the
 * fill plane's normal.
 *
 * @param mesh Mesh to add to.
 * @param ring Filled loop.
 * @param holes Its holes.
 */
function solidScriptFillOne(
  mesh: SolidScriptShapeMesh,
  ring: SolidScriptFillRing,
  holes: readonly SolidScriptFillRing[],
): void {
  const base = mesh.points.length;
  const all = [ring, ...holes];
  const flat = all.flatMap((part) => part.flat);
  mesh.points.push(...all.flatMap((part) => part.points.map((point) => point.clone())));
  for (const [a = 0, b = 0, c = 0] of THREE.ShapeUtils.triangulateShape(
    ring.flat,
    holes.map((hole) => hole.flat),
  )) {
    const turn = THREE.ShapeUtils.area([
      flat[a] ?? new THREE.Vector2(),
      flat[b] ?? new THREE.Vector2(),
      flat[c] ?? new THREE.Vector2(),
    ]);
    mesh.faces.push(turn >= 0 ? [base + a, base + b, base + c] : [base + a, base + c, base + b]);
    mesh.uvs.push(null);
  }
}

/**
 * Drops a last point that repeats the first.
 *
 * @param loop Loop.
 * @returns Loop without the repeat.
 */
function solidScriptFillOpen(loop: readonly THREE.Vector3[]): THREE.Vector3[] {
  const first = loop[0];
  const last = loop[loop.length - 1];
  const repeats = loop.length > 1 && first && last && first.distanceTo(last) <= 1e-9;
  return repeats ? loop.slice(0, -1) : [...loop];
}

/**
 * The direction a loop faces, as long as twice its area.
 *
 * @param loop Loop.
 * @returns Normal times twice the area.
 */
function solidScriptFillNewell(loop: readonly THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  loop.forEach((a, index) => {
    const b = loop[(index + 1) % loop.length] ?? a;
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  });
  return normal;
}
