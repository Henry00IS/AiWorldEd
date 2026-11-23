import * as THREE from 'three';
import {
  solidScriptUnfoldCorner,
  solidScriptUnfoldShift,
  solidScriptUvUnfold,
  type SolidScriptUnfoldFace,
  type SolidScriptUnfoldLink,
} from './solid_script_uv_unfold.js';

/** One row of the least-squares system: weighted unknowns and a constant. */
interface SolidScriptConformalRow {
  terms: [number, number][];
  rest: number;
}

/** Most conjugate gradient steps per island. */
const SOLID_SCRIPT_CONFORMAL_STEPS = 4000;

/**
 * Lays faces flat as islands joined along links, like Unfold, then relaxes
 * every island with more than one face into a least-squares conformal map:
 * corners shared by joined faces become one UV, and each triangle's map is kept
 * as close to a similarity (no shear, the same stretch both ways) as the
 * surface allows, weighted by its area. The two corners of the island farthest
 * apart keep their unfolded UVs, which fixes its place, turn and scale. The
 * result keeps angles on curved islands where unfolding would leave cracks.
 *
 * @param faces Faces.
 * @param links Edges that are not seams.
 * @param size Metres of one texture repeat.
 * @returns Corner UVs per face, in corner order.
 */
export function solidScriptUvConformal(
  faces: readonly SolidScriptUnfoldFace[],
  links: readonly SolidScriptUnfoldLink[],
  size: number,
): [number, number][][] {
  const uvs = solidScriptUvUnfold(faces, links, size).map((face) => face.map(([u, v]) => new THREE.Vector2(u, v)));
  const ids = solidScriptConformalIds(faces, links);
  let start = 0;
  for (const island of solidScriptConformalIslands(faces.length, links)) {
    if (island.length > 1) solidScriptConformalIsland(faces, island, ids, uvs, size);
    start = solidScriptUnfoldShift(
      island.map((index) => uvs[index] ?? []),
      start,
    );
  }
  return uvs.map((face) => face.map((uv): [number, number] => [uv.x, uv.y]));
}

/**
 * Groups faces joined by links.
 *
 * @param count Number of faces.
 * @param links Joined edges.
 * @returns Face numbers of each island, in the order of their first face.
 */
function solidScriptConformalIslands(count: number, links: readonly SolidScriptUnfoldLink[]): number[][] {
  const owner = Array.from({ length: count }, (_, index) => index);
  const root = (index: number): number => (owner[index] === index ? index : (owner[index] = root(owner[index]!)));
  links.forEach((link) => (owner[root(link.a)] = root(link.b)));
  const islands = new Map<number, number[]>();
  owner.forEach((_, index) => islands.set(root(index), [...(islands.get(root(index)) ?? []), index]));
  return [...islands.values()];
}

/**
 * Numbers every face corner so corners joined across a link share a number.
 *
 * @param faces Faces.
 * @param links Joined edges.
 * @returns Number of each corner, per face.
 */
function solidScriptConformalIds(
  faces: readonly SolidScriptUnfoldFace[],
  links: readonly SolidScriptUnfoldLink[],
): number[][] {
  const first = faces.reduce<number[]>((list, face, index) => [...list, (list[index] ?? 0) + face.corners.length], [0]);
  const owner = Array.from({ length: first[faces.length] ?? 0 }, (_, index) => index);
  const root = (index: number): number => (owner[index] === index ? index : (owner[index] = root(owner[index]!)));
  for (const link of links)
    for (const end of [link.p, link.q]) {
      const a = solidScriptUnfoldCorner(faces[link.a], end);
      const b = solidScriptUnfoldCorner(faces[link.b], end);
      if (a >= 0 && b >= 0) owner[root(first[link.a]! + a)] = root(first[link.b]! + b);
    }
  return faces.map((face, index) => face.corners.map((_, at) => root(first[index]! + at)));
}

/**
 * Relaxes one island into a least-squares conformal map, writing its UVs.
 *
 * @param faces Faces.
 * @param island Face numbers of the island.
 * @param ids Number of each corner, per face.
 * @param uvs Unfolded UVs per face, rewritten in place.
 * @param size Metres of one texture repeat.
 */
function solidScriptConformalIsland(
  faces: readonly SolidScriptUnfoldFace[],
  island: readonly number[],
  ids: readonly number[][],
  uvs: THREE.Vector2[][],
  size: number,
): void {
  const { slot, points, start } = solidScriptConformalUnknowns(faces, island, ids, uvs);
  const pins = solidScriptConformalPins(points, solidScriptConformalBorder(island, ids, slot), start, size);
  const sign = solidScriptConformalSign(island, uvs);
  const rows = island.flatMap((index) => solidScriptConformalRows(faces[index]!, ids[index]!, slot, sign, pins, start));
  const solved = solidScriptConformalSolve(rows, start, pins);
  island.forEach((index) =>
    ids[index]!.forEach((id, at) => {
      const s = slot.get(id)!;
      uvs[index]![at] = new THREE.Vector2(solved[2 * s]!, solved[2 * s + 1]!);
    }),
  );
}

/**
 * Gives each distinct corner of an island an unknown, starting from the mean of
 * its unfolded UVs.
 *
 * @param faces Faces.
 * @param island Face numbers of the island.
 * @param ids Number of each corner, per face.
 * @param uvs Unfolded UVs per face.
 * @returns Slot of each corner number, the place of each slot, and the starting
 *   U and V of every slot, U then V.
 */
function solidScriptConformalUnknowns(
  faces: readonly SolidScriptUnfoldFace[],
  island: readonly number[],
  ids: readonly number[][],
  uvs: readonly THREE.Vector2[][],
): { slot: Map<number, number>; points: THREE.Vector3[]; start: number[] } {
  const slot = new Map<number, number>();
  const points: THREE.Vector3[] = [];
  const sums: THREE.Vector3[] = [];
  for (const index of island)
    ids[index]!.forEach((id, at) => {
      if (!slot.has(id))
        [slot.set(id, points.length), points.push(faces[index]!.corners[at]!), sums.push(new THREE.Vector3())];
      const uv = uvs[index]![at]!;
      sums[slot.get(id)!]!.add(new THREE.Vector3(uv.x, uv.y, 1));
    });
  return { slot, points, start: sums.flatMap((sum) => [sum.x / sum.z, sum.y / sum.z]) };
}

/**
 * The slots on the island's border: ends of face sides no other face of the
 * island shares.
 *
 * @param island Face numbers of the island.
 * @param ids Number of each corner, per face.
 * @param slot Slot of each corner number.
 * @returns Border slots; every slot when the island is closed.
 */
function solidScriptConformalBorder(
  island: readonly number[],
  ids: readonly number[][],
  slot: ReadonlyMap<number, number>,
): number[] {
  const sides = new Map<string, [number, number]>();
  for (const index of island)
    ids[index]!.forEach((id, at) => {
      const [a, b] = [slot.get(id)!, slot.get(ids[index]![(at + 1) % ids[index]!.length]!)!].sort((x, y) => x - y);
      const key = `${a}-${b}`;
      sides.set(key, sides.has(key) ? [-1, -1] : [a!, b!]);
    });
  const border = [...new Set([...sides.values()].flat().filter((value) => value >= 0))];
  return border.length >= 2 ? border : [...slot.values()];
}

/**
 * Picks the two border corners that keep their UVs, far apart: one far from the
 * first, then the one farthest from it. The second is set at its true distance
 * from the first, along the way the unfolded UVs run between them.
 *
 * @param points Place of each slot.
 * @param border Slots that may be picked.
 * @param start Starting U and V of every slot, the second pin's changed.
 * @param size Metres of one texture repeat.
 * @returns Two slots.
 */
function solidScriptConformalPins(
  points: readonly THREE.Vector3[],
  border: readonly number[],
  start: number[],
  size: number,
): [number, number] {
  const farthest = (from: THREE.Vector3): number =>
    border.reduce((best, slot) => (points[slot]!.distanceTo(from) > points[best]!.distanceTo(from) ? slot : best));
  const a = farthest(points[border[0]!]!);
  const b = farthest(points[a]!);
  const way = new THREE.Vector2(start[2 * b]! - start[2 * a]!, start[2 * b + 1]! - start[2 * a + 1]!);
  if (way.lengthSq() <= 1e-18) way.set(1, 0);
  way.setLength(points[a]!.distanceTo(points[b]!) / size);
  [start[2 * b], start[2 * b + 1]] = [start[2 * a]! + way.x, start[2 * a + 1]! + way.y];
  return [a, b];
}

/**
 * Whether the unfolded island keeps each face's corner order turning the same
 * way in UV space (1) or mirrors it (-1).
 *
 * @param island Face numbers of the island.
 * @param uvs Unfolded UVs per face.
 * @returns 1 or -1.
 */
function solidScriptConformalSign(island: readonly number[], uvs: readonly THREE.Vector2[][]): number {
  const flat = uvs[island[0]!]!;
  const area = flat.reduce((sum, uv, at) => sum + uv.cross(flat[(at + 1) % flat.length]!), 0);
  return area >= 0 ? 1 : -1;
}

/**
 * The two rows each triangle of a face adds: the map's shear and its unequal
 * stretch, weighted by the square root of the triangle's area. Faces are split
 * into a fan from their first corner.
 *
 * @param face Face.
 * @param ids Number of each corner.
 * @param slot Slot of each corner number.
 * @param sign 1 to keep the turn of the faces, -1 to mirror it.
 * @param pins Slots that keep their UVs.
 * @param start Starting U and V of every slot.
 * @returns Rows.
 */
function solidScriptConformalRows(
  face: SolidScriptUnfoldFace,
  ids: readonly number[],
  slot: ReadonlyMap<number, number>,
  sign: number,
  pins: readonly number[],
  start: readonly number[],
): SolidScriptConformalRow[] {
  return face.corners.slice(2).flatMap((_, at) => {
    const corners = [0, at + 1, at + 2];
    const gradients = solidScriptConformalGradients(corners.map((corner) => face.corners[corner]!));
    if (!gradients) return [];
    const slots = corners.map((corner) => slot.get(ids[corner]!)!);
    const rowX = slots.flatMap((s, j): [number, number][] => [
      [2 * s, gradients[j]!.x],
      [2 * s + 1, -sign * gradients[j]!.y],
    ]);
    const rowY = slots.flatMap((s, j): [number, number][] => [
      [2 * s, gradients[j]!.y],
      [2 * s + 1, sign * gradients[j]!.x],
    ]);
    return [rowX, rowY].map((terms) => solidScriptConformalPinned(terms, pins, start));
  });
}

/**
 * Gradients of a triangle's three corner weights in its own plane, scaled by
 * the square root of its area, or null for a sliver.
 *
 * @param points Triangle corners.
 * @returns Three gradients.
 */
function solidScriptConformalGradients(points: readonly THREE.Vector3[]): THREE.Vector2[] | null {
  const [p0, p1, p2] = points as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const e1 = p1.clone().sub(p0);
  const e2 = p2.clone().sub(p0);
  const normal = e1.clone().cross(e2);
  const twice = normal.length();
  if (!(twice > 1e-12) || !(e1.length() > 1e-12)) return null;
  const x = e1.clone().normalize();
  const y = normal.clone().cross(x).normalize();
  const flat = [new THREE.Vector2(), new THREE.Vector2(e1.length(), 0), new THREE.Vector2(e2.dot(x), e2.dot(y))];
  const weight = Math.sqrt(twice / 2) / twice;
  return flat.map((_, j) => {
    const edge = flat[(j + 2) % 3]!.clone().sub(flat[(j + 1) % 3]!);
    return new THREE.Vector2(-edge.y * weight, edge.x * weight);
  });
}

/**
 * Moves the terms of pinned unknowns into the row's constant.
 *
 * @param terms Unknowns and their weights.
 * @param pins Slots that keep their UVs.
 * @param start Starting U and V of every slot.
 * @returns Row.
 */
function solidScriptConformalPinned(
  terms: readonly [number, number][],
  pins: readonly number[],
  start: readonly number[],
): SolidScriptConformalRow {
  const pinned = (column: number) => pins.includes(Math.floor(column / 2));
  return {
    terms: terms.filter(([column]) => !pinned(column)),
    rest: terms
      .filter(([column]) => pinned(column))
      .reduce((sum, [column, weight]) => sum - weight * start[column]!, 0),
  };
}

/**
 * Solves the rows in the least-squares sense by conjugate gradients on the
 * normal equations, from the starting UVs.
 *
 * @param rows Rows.
 * @param start Starting U and V of every slot.
 * @param pins Slots that keep their UVs.
 * @returns U and V of every slot.
 */
function solidScriptConformalSolve(
  rows: readonly SolidScriptConformalRow[],
  start: readonly number[],
  pins: readonly number[],
): number[] {
  const x = [...start];
  const apply = (vector: readonly number[]): number[] => solidScriptConformalNormal(rows, vector, x.length);
  const current = apply(x);
  const residual = solidScriptConformalNormal(rows, x, x.length, true).map((value, at) => value - current[at]!);
  pins.forEach((pin) => (residual[2 * pin] = residual[2 * pin + 1] = 0));
  let direction = [...residual];
  let size = solidScriptConformalDot(residual, residual);
  for (let step = 0; step < SOLID_SCRIPT_CONFORMAL_STEPS && size > 1e-24; step++) {
    const pushed = apply(direction);
    const alpha = size / solidScriptConformalDot(direction, pushed);
    direction.forEach((value, at) => ((x[at]! += alpha * value), (residual[at]! -= alpha * pushed[at]!)));
    const next = solidScriptConformalDot(residual, residual);
    direction = residual.map((value, at) => value + (next / size) * direction[at]!);
    size = next;
  }
  return x;
}

/**
 * Multiplies by the normal matrix of the rows, or with Rest builds the right
 * side from the rows' constants.
 *
 * @param rows Rows.
 * @param vector Vector to multiply.
 * @param count Number of unknowns.
 * @param rest True to return the right side instead.
 * @returns Product.
 */
function solidScriptConformalNormal(
  rows: readonly SolidScriptConformalRow[],
  vector: readonly number[],
  count: number,
  rest = false,
): number[] {
  const out = new Array<number>(count).fill(0);
  for (const row of rows) {
    const value = rest ? row.rest : row.terms.reduce((sum, [column, weight]) => sum + weight * vector[column]!, 0);
    for (const [column, weight] of row.terms) out[column]! += weight * value;
  }
  return out;
}

/**
 * Dot product.
 *
 * @param a First vector.
 * @param b Second vector.
 * @returns Sum of products.
 */
function solidScriptConformalDot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, at) => sum + value * b[at]!, 0);
}
