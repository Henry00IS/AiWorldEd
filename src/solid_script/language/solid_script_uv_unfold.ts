import * as THREE from 'three';
import { solidScriptPathFrame } from './solid_script_path_shape.js';

/** A face to lay flat: its corners in order and the way it faces. */
export interface SolidScriptUnfoldFace {
  corners: readonly THREE.Vector3[];
  normal: THREE.Vector3;
}

/** Two faces that stay joined in UV space along the edge from p to q. */
export interface SolidScriptUnfoldLink {
  a: number;
  b: number;
  p: THREE.Vector3;
  q: THREE.Vector3;
}

/**
 * Lays faces flat in UV space, keeping linked faces joined: each island of
 * linked faces starts from one face laid on its own plane, and every face next
 * to a laid one is folded open about the edge they share, so lengths and angles
 * stay true. Islands are laid side by side along U, each starting a whole
 * number of repeats after the one before with a gap of one, and their lowest V
 * is 0.
 *
 * @param faces Faces.
 * @param links Edges that are not seams.
 * @param size Metres of one texture repeat.
 * @returns Corner UVs per face, in corner order.
 */
export function solidScriptUvUnfold(
  faces: readonly SolidScriptUnfoldFace[],
  links: readonly SolidScriptUnfoldLink[],
  size: number,
): [number, number][][] {
  const flat = faces.map((face) => solidScriptUnfoldFlat(face, size));
  const placed: (THREE.Vector2[] | undefined)[] = faces.map(() => undefined);
  let start = 0;
  faces.forEach((_, root) => {
    if (placed[root]) return;
    placed[root] = flat[root];
    const island = solidScriptUnfoldIsland(root, faces, links, flat, placed);
    start = solidScriptUnfoldShift(
      island.map((index) => placed[index] ?? []),
      start,
    );
  });
  return placed.map((uvs) => (uvs ?? []).map((uv): [number, number] => [uv.x, uv.y]));
}

/**
 * Folds open every face linked to a root, one neighbour at a time.
 *
 * @param root Face laid first.
 * @param faces Faces.
 * @param links Joined edges.
 * @param flat Each face laid on its own plane.
 * @param placed UVs laid so far, filled in.
 * @returns Faces of the island.
 */
function solidScriptUnfoldIsland(
  root: number,
  faces: readonly SolidScriptUnfoldFace[],
  links: readonly SolidScriptUnfoldLink[],
  flat: readonly THREE.Vector2[][],
  placed: (THREE.Vector2[] | undefined)[],
): number[] {
  const island = [root];
  for (let at = 0; at < island.length; at++) {
    const from = island[at] ?? root;
    for (const link of links) {
      const to = link.a === from ? link.b : link.b === from ? link.a : -1;
      if (to < 0 || placed[to]) continue;
      const laid = solidScriptUnfoldHinge(faces, flat, placed, from, to, link);
      if (!laid) continue;
      placed[to] = laid;
      island.push(to);
    }
  }
  return island;
}

/**
 * Lays a face next to a laid one so the edge they share lines up.
 *
 * @param faces Faces.
 * @param flat Each face laid on its own plane.
 * @param placed UVs laid so far.
 * @param from Laid face.
 * @param to Face to lay.
 * @param link Shared edge.
 * @returns UVs of the new face, or undefined when the edge is not on both.
 */
function solidScriptUnfoldHinge(
  faces: readonly SolidScriptUnfoldFace[],
  flat: readonly THREE.Vector2[][],
  placed: readonly (THREE.Vector2[] | undefined)[],
  from: number,
  to: number,
  link: SolidScriptUnfoldLink,
): THREE.Vector2[] | undefined {
  const there = [link.p, link.q].map((end) => solidScriptUnfoldCorner(faces[from], end));
  const here = [link.p, link.q].map((end) => solidScriptUnfoldCorner(faces[to], end));
  const [tp = -1, tq = -1] = there;
  const [hp = -1, hq = -1] = here;
  const target = placed[from];
  const own = flat[to];
  if (tp < 0 || tq < 0 || hp < 0 || hq < 0 || !target || !own) return undefined;
  return solidScriptUnfoldMove(own, own[hp], own[hq], target[tp], target[tq]);
}

/**
 * Turns and moves flat points so a and b land on toA and toB.
 *
 * @param points Flat points.
 * @param a First edge end, before.
 * @param b Second edge end, before.
 * @param toA First edge end, after.
 * @param toB Second edge end, after.
 * @returns Moved points.
 */
function solidScriptUnfoldMove(
  points: readonly THREE.Vector2[],
  a: THREE.Vector2 | undefined,
  b: THREE.Vector2 | undefined,
  toA: THREE.Vector2 | undefined,
  toB: THREE.Vector2 | undefined,
): THREE.Vector2[] | undefined {
  if (!a || !b || !toA || !toB) return undefined;
  const turn = Math.atan2(toB.y - toA.y, toB.x - toA.x) - Math.atan2(b.y - a.y, b.x - a.x);
  return points.map((point) => point.clone().sub(a).rotateAround(new THREE.Vector2(), turn).add(toA));
}

/**
 * Finds the corner of a face at a point.
 *
 * @param face Face.
 * @param point Point.
 * @returns Corner index, or -1.
 */
export function solidScriptUnfoldCorner(face: SolidScriptUnfoldFace | undefined, point: THREE.Vector3): number {
  return face?.corners.findIndex((corner) => corner.distanceTo(point) <= 1e-6) ?? -1;
}

/**
 * Lays a face on its own plane, in texture repeats.
 *
 * @param face Face.
 * @param size Metres of one repeat.
 * @returns Flat corners.
 */
function solidScriptUnfoldFlat(face: SolidScriptUnfoldFace, size: number): THREE.Vector2[] {
  const frame = solidScriptPathFrame(face.normal, 'Unwrap');
  return face.corners.map((corner) => new THREE.Vector2(corner.dot(frame.x) / size, corner.dot(frame.y) / size));
}

/**
 * Moves an island so its lowest U is Start and its lowest V is 0.
 *
 * @param island UVs of its faces, moved in place.
 * @param start Lowest U for the island.
 * @returns Lowest U for the next island: a whole number, at least one past this
 *   one's right side.
 */
export function solidScriptUnfoldShift(island: readonly THREE.Vector2[][], start: number): number {
  const all = island.flat();
  const low = new THREE.Vector2(Math.min(...all.map((uv) => uv.x)) - start, Math.min(...all.map((uv) => uv.y)));
  all.forEach((uv) => uv.sub(low));
  return Math.ceil(Math.max(start, ...all.map((uv) => uv.x))) + 1;
}
