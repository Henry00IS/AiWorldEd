import * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import { solidScriptPathFrame } from './solid_script_path_shape.js';

/** A closed loop laid flat in the fill plane, with its points in space. */
interface SolidScriptFillRing {
  points: THREE.Vector3[];
  flat: THREE.Vector2[];
  area: number;
  turn: number;
}

/**
 * Which areas Fill Paths fills: Even-Odd by how deep a loop sits, Non-Zero by
 * how often loops wind round it.
 */
export type SolidScriptFillRule = 'Even-Odd' | 'Non-Zero';

/**
 * Fills closed loops with triangles, the way a floor plan is filled. With
 * Even-Odd a loop inside one other loop is a hole, one inside two is filled
 * again, and so on. With Non-Zero the area inside a loop is filled when the
 * loops round it, counted 1 for each that runs one way and -1 for each that
 * runs the other, do not add up to 0, so a loop inside another running the same
 * way fills rather than cuts a hole. Every loop is laid flat in the plane of
 * the biggest one.
 *
 * @param loops Closed loops, each at least 3 points.
 * @param label Command, for messages.
 * @param rule Even-Odd or Non-Zero.
 * @returns Mesh of triangles facing the way the biggest loop runs round.
 */
export function solidScriptFillPaths(
  loops: readonly THREE.Vector3[][],
  label: string,
  rule: SolidScriptFillRule,
): SolidScriptShapeMesh {
  const usable = loops.map(solidScriptFillOpen).filter((loop) => loop.length >= 3);
  if (usable.length === 0) throw new Error(`${label} needs a closed path with at least 3 points`);
  const normal = usable
    .map(solidScriptFillNewell)
    .reduce((best, next) => (next.length() > best.length() ? next : best));
  if (normal.lengthSq() <= 1e-18) throw new Error(`${label} needs paths that enclose some area`);
  const frame = solidScriptPathFrame(normal, label);
  const rings = usable.map((points): SolidScriptFillRing => {
    const flat = points.map((point) => new THREE.Vector2(point.dot(frame.x), point.dot(frame.y)));
    const area = THREE.ShapeUtils.area(flat);
    return { points, flat, area: Math.abs(area), turn: Math.sign(area) };
  });
  const filled = new Map(rings.map((ring) => [ring, solidScriptFillFilled(ring, rings, rule)]));
  const mesh: SolidScriptShapeMesh = { kind: 'mesh', label: 'mesh', points: [], faces: [], uvs: [] };
  rings.forEach((ring) => {
    const parent = solidScriptFillParent(ring, rings);
    if (filled.get(ring) && !(parent && filled.get(parent)))
      solidScriptFillOne(mesh, ring, solidScriptFillHoles(ring, rings, filled));
  });
  return mesh;
}

/**
 * Whether the area just inside a loop is filled under the rule.
 *
 * @param ring Loop.
 * @param rings Every loop.
 * @param rule Even-Odd or Non-Zero.
 * @returns True when filled.
 */
function solidScriptFillFilled(
  ring: SolidScriptFillRing,
  rings: readonly SolidScriptFillRing[],
  rule: SolidScriptFillRule,
): boolean {
  const around = rings.filter((other) => other !== ring && solidScriptFillHolds(other, ring));
  if (rule === 'Even-Odd') return around.length % 2 === 0;
  return around.reduce((sum, other) => sum + other.turn, ring.turn) !== 0;
}

/**
 * The smallest loop that holds a loop.
 *
 * @param ring Loop.
 * @param rings Every loop.
 * @returns Parent, or undefined at the top.
 */
function solidScriptFillParent(
  ring: SolidScriptFillRing,
  rings: readonly SolidScriptFillRing[],
): SolidScriptFillRing | undefined {
  return rings
    .filter((other) => other !== ring && solidScriptFillHolds(other, ring))
    .reduce<SolidScriptFillRing | undefined>(
      (best, other) => (!best || other.area < best.area ? other : best),
      undefined,
    );
}

/**
 * The holes of a filled loop: the nearest unfilled loops inside it, with only
 * filled loops between.
 *
 * @param ring Filled loop.
 * @param rings Every loop.
 * @param filled Whether each loop is filled.
 * @returns Holes.
 */
function solidScriptFillHoles(
  ring: SolidScriptFillRing,
  rings: readonly SolidScriptFillRing[],
  filled: ReadonlyMap<SolidScriptFillRing, boolean>,
): SolidScriptFillRing[] {
  const inside = rings.filter((other) => other !== ring && solidScriptFillHolds(ring, other));
  return inside.filter(
    (other) =>
      !filled.get(other) &&
      inside.every((between) => between === other || !solidScriptFillHolds(between, other) || filled.get(between)),
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
