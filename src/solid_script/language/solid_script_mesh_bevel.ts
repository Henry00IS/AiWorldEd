import * as THREE from 'three';
import { solidScriptMeshLoopNormal, type SolidScriptShapeMesh } from './solid_script_mesh.js';

/** Corners closer than this, in metres, are one corner while bevelling. */
const SOLID_SCRIPT_MESH_BEVEL_SAME = 1e-5;

/** An edge or corner to bevel, found by where it is, and how far to cut. */
export interface SolidScriptMeshBevelPick {
  /** Ends of an edge, or one point for a corner. */
  at: readonly THREE.Vector3[];
  /** Metres to cut back along the edges that meet it. */
  distance: number;
}

/** A mesh after a bevel and the numbers of the faces it made. */
export interface SolidScriptMeshBevelled {
  mesh: SolidScriptShapeMesh;
  made: number[];
  /** How many picked edges were left alone because they are on an open border. */
  skipped: number;
}

/** Working state of one bevel: corners joined by place and the picks. */
interface SolidScriptMeshBevelWork {
  points: THREE.Vector3[];
  loops: number[][];
  twins: Map<string, [number, number]>;
  edges: Set<string>;
  distances: Map<number, number>;
  slides: Map<string, number>;
}

/**
 * Reads an entry of a list, counting round from the end, and stops when the
 * list is empty.
 *
 * @param list List.
 * @param index Spot, wrapped into the list.
 * @returns Entry.
 */
function solidScriptMeshBevelAt<Entry>(list: readonly Entry[], index: number): Entry {
  const entry = list[((index % list.length) + list.length) % list.length];
  if (entry === undefined) throw new Error('Bevel found an empty face');
  return entry;
}

/**
 * Key of the undirected edge between two corners.
 *
 * @param a Corner.
 * @param b Corner.
 * @returns Key.
 */
function solidScriptMeshBevelEdgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/**
 * Joins corners at the same place, so faces built apart share their edges.
 *
 * @param mesh Mesh.
 * @returns Joined corners, the faces using them, and the number of a place.
 */
function solidScriptMeshBevelWeld(mesh: SolidScriptShapeMesh) {
  const points: THREE.Vector3[] = [];
  const known = new Map<string, number>();
  const placeOf = (point: THREE.Vector3): number => {
    const key = point
      .toArray()
      .map((value) => Math.round(value / SOLID_SCRIPT_MESH_BEVEL_SAME))
      .join(',');
    const found = known.get(key);
    if (found !== undefined) return found;
    known.set(key, points.length);
    return points.push(point.clone()) - 1;
  };
  const loops = mesh.faces.map((loop) =>
    loop
      .map((corner) => placeOf(mesh.points[corner] ?? new THREE.Vector3()))
      .filter((p, i, all) => p !== all[(i + 1) % all.length]),
  );
  return { points, loops, placeOf };
}

/**
 * Lists, for every edge running from one corner to the next, the face and the
 * spot in it where it runs that way.
 *
 * @param loops Faces.
 * @returns Face and corner spot by directed edge.
 */
function solidScriptMeshBevelTwins(loops: readonly number[][]): Map<string, [number, number]> {
  const twins = new Map<string, [number, number]>();
  loops.forEach((loop, face) =>
    loop.forEach((corner, spot) => twins.set(`${corner}>${loop[(spot + 1) % loop.length]}`, [face, spot])),
  );
  return twins;
}

/**
 * Reads the picks into bevelled edges and the distance at each corner they
 * touch; a corner where several meet takes the largest. Edges on an open
 * border, with a face on one side only, are left alone.
 *
 * @param work Bevel state, filled in.
 * @param picks Edges and corners.
 * @param placeOf Number of the joined corner at a place.
 * @returns How many edges were left alone.
 */
function solidScriptMeshBevelPicks(
  work: SolidScriptMeshBevelWork,
  picks: readonly SolidScriptMeshBevelPick[],
  placeOf: (point: THREE.Vector3) => number,
): number {
  let skipped = 0;
  for (const pick of picks) {
    const corners = pick.at.map(placeOf);
    const [a, b] = corners;
    if (a !== undefined && b !== undefined) {
      if (!work.twins.has(`${a}>${b}`) || !work.twins.has(`${b}>${a}`)) {
        skipped++;
        continue;
      }
      work.edges.add(solidScriptMeshBevelEdgeKey(a, b));
    }
    for (const corner of corners) work.distances.set(corner, Math.max(work.distances.get(corner) ?? 0, pick.distance));
  }
  return skipped;
}

/**
 * Whether the edge between two corners is bevelled.
 *
 * @param work Bevel state.
 * @param a Corner.
 * @param b Corner.
 * @returns True when bevelled.
 */
function solidScriptMeshBevelPicked(work: SolidScriptMeshBevelWork, a: number, b: number): boolean {
  return work.edges.has(solidScriptMeshBevelEdgeKey(a, b));
}

/**
 * Direction from one corner toward another.
 *
 * @param work Bevel state.
 * @param from Corner.
 * @param to Corner.
 * @returns Unit direction.
 */
function solidScriptMeshBevelToward(work: SolidScriptMeshBevelWork, from: number, to: number): THREE.Vector3 {
  return solidScriptMeshBevelPoint(work, to).clone().sub(solidScriptMeshBevelPoint(work, from)).normalize();
}

/**
 * Adds a new corner and gives its number.
 *
 * @param work Bevel state.
 * @param point Place.
 * @returns Number.
 */
function solidScriptMeshBevelAdd(work: SolidScriptMeshBevelWork, point: THREE.Vector3): number {
  return work.points.push(point) - 1;
}

/**
 * The distance of a bevelled corner, stopping when it does not fit on an edge
 * that leaves it: half the edge when its other end is bevelled too.
 *
 * @param work Bevel state.
 * @param from Bevelled corner.
 * @param to The edge's other corner.
 * @returns Metres.
 */
function solidScriptMeshBevelRoom(work: SolidScriptMeshBevelWork, from: number, to: number): number {
  const distance = work.distances.get(from) ?? 0;
  const length = solidScriptMeshBevelPoint(work, to).distanceTo(solidScriptMeshBevelPoint(work, from));
  const room = work.distances.has(to) ? length / 2 : length;
  if (distance >= room - 1e-9)
    throw new Error(
      `Bevel Distance ${distance} is too long for an edge of ${Math.round(length * 1e4) / 1e4} m; try a Distance below half the shortest edge`,
    );
  return distance;
}

/**
 * The place of a corner.
 *
 * @param work Bevel state.
 * @param corner Corner number.
 * @returns Place.
 */
function solidScriptMeshBevelPoint(work: SolidScriptMeshBevelWork, corner: number): THREE.Vector3 {
  const point = work.points[corner];
  if (!point) throw new Error(`Bevel lost corner ${corner}`);
  return point;
}

/**
 * The corner a bevel puts on an edge that is not bevelled, its distance from a
 * bevelled corner; both faces along that edge share it.
 *
 * @param work Bevel state.
 * @param from Bevelled corner.
 * @param to The edge's other corner.
 * @returns Number of the new corner.
 */
function solidScriptMeshBevelSlide(work: SolidScriptMeshBevelWork, from: number, to: number): number {
  const key = `${from}>${to}`;
  const known = work.slides.get(key);
  if (known !== undefined) return known;
  const distance = solidScriptMeshBevelRoom(work, from, to);
  const slid = solidScriptMeshBevelAdd(
    work,
    solidScriptMeshBevelPoint(work, from)
      .clone()
      .addScaledVector(solidScriptMeshBevelToward(work, from, to), distance),
  );
  work.slides.set(key, slid);
  return slid;
}

/**
 * The corners that take the place of one bevelled corner of a face: one where a
 * bevelled edge leaves it, two where none does.
 *
 * @param work Bevel state.
 * @param before Corner before it in the face.
 * @param corner The corner.
 * @param after Corner after it.
 * @returns New corners, in the face's order.
 */
function solidScriptMeshBevelCorner(
  work: SolidScriptMeshBevelWork,
  before: number,
  corner: number,
  after: number,
): number[] {
  const into = solidScriptMeshBevelPicked(work, before, corner);
  const out = solidScriptMeshBevelPicked(work, corner, after);
  if (into && out) {
    const distance = Math.max(
      solidScriptMeshBevelRoom(work, corner, before),
      solidScriptMeshBevelRoom(work, corner, after),
    );
    const spot = solidScriptMeshBevelPoint(work, corner)
      .clone()
      .addScaledVector(solidScriptMeshBevelToward(work, corner, before), distance)
      .addScaledVector(solidScriptMeshBevelToward(work, corner, after), distance);
    return [solidScriptMeshBevelAdd(work, spot)];
  }
  if (into) return [solidScriptMeshBevelSlide(work, corner, after)];
  if (out) return [solidScriptMeshBevelSlide(work, corner, before)];
  return [solidScriptMeshBevelSlide(work, corner, before), solidScriptMeshBevelSlide(work, corner, after)];
}

/**
 * Works out the new corners of every face corner the bevel touches.
 *
 * @param work Bevel state.
 * @returns New corners per face and spot; untouched corners keep their own.
 */
function solidScriptMeshBevelCorners(work: SolidScriptMeshBevelWork): number[][][] {
  return work.loops.map((loop) =>
    loop.map((corner, spot) => {
      if (!work.distances.has(corner)) return [corner];
      const before = solidScriptMeshBevelAt(loop, spot - 1);
      return solidScriptMeshBevelCorner(work, before, corner, solidScriptMeshBevelAt(loop, spot + 1));
    }),
  );
}

/**
 * The single new corner of a face at a corner, where a bevelled edge leaves it.
 *
 * @param work Bevel state.
 * @param corners New corners per face and spot.
 * @param from Directed edge start.
 * @param to Directed edge end.
 * @returns New corners at the start and at the end of that edge in its face.
 */
function solidScriptMeshBevelEnds(
  work: SolidScriptMeshBevelWork,
  corners: number[][][],
  from: number,
  to: number,
): [number, number] {
  const found = work.twins.get(`${from}>${to}`);
  if (!found) throw new Error('Bevel needs edges with a face on both sides; this edge is on an open border');
  const [face, spot] = found;
  const loop = solidScriptMeshBevelAt(corners, face);
  return [
    solidScriptMeshBevelAt(solidScriptMeshBevelAt(loop, spot), 0),
    solidScriptMeshBevelAt(solidScriptMeshBevelAt(loop, spot + 1), 0),
  ];
}

/**
 * The strip of one bevelled edge, between the faces on its two sides.
 *
 * @param work Bevel state.
 * @param corners New corners per face and spot.
 * @param key Edge key.
 * @returns Strip face.
 */
function solidScriptMeshBevelStrip(work: SolidScriptMeshBevelWork, corners: number[][][], key: string): number[] {
  const [a, b] = key.split(',').map(Number) as [number, number];
  const [firstA, firstB] = solidScriptMeshBevelEnds(work, corners, a, b);
  const [secondB, secondA] = solidScriptMeshBevelEnds(work, corners, b, a);
  return [firstB, firstA, secondA, secondB];
}

/**
 * Walks the faces around a bevelled corner and gives the new corners in that
 * order, each once.
 *
 * @param work Bevel state.
 * @param corners New corners per face and spot.
 * @param corner The corner.
 * @returns Ring of new corners, or an empty list when the corner is on an open
 *   border.
 */
function solidScriptMeshBevelRing(work: SolidScriptMeshBevelWork, corners: number[][][], corner: number): number[] {
  const ring: number[] = [];
  const start = [...work.twins.entries()].find(([key]) => key.startsWith(`${corner}>`))?.[1];
  let at = start;
  for (let guard = 0; at && guard < work.loops.length; guard++) {
    const [face, spot] = at;
    const loop = solidScriptMeshBevelAt(work.loops, face);
    ring.push(...[...solidScriptMeshBevelAt(solidScriptMeshBevelAt(corners, face), spot)].reverse());
    at = work.twins.get(`${corner}>${loop[(spot + loop.length - 1) % loop.length]}`);
    if (at && start && at[0] === start[0])
      return ring.filter((value, index) => value !== ring[(index + 1) % ring.length]);
  }
  return [];
}

/**
 * The face that fills the hole a bevel leaves at a corner, turned to look the
 * way the faces around it do; none when the strips close it already.
 *
 * @param work Bevel state.
 * @param corners New corners per face and spot.
 * @param corner The corner.
 * @param outward Direction the faces around it look.
 * @returns Face, or null.
 */
function solidScriptMeshBevelPatch(
  work: SolidScriptMeshBevelWork,
  corners: number[][][],
  corner: number,
  outward: THREE.Vector3,
): number[] | null {
  const ring = solidScriptMeshBevelRing(work, corners, corner);
  if (ring.length < 3) return null;
  return solidScriptMeshLoopNormal(work.points, ring).dot(outward) < 0 ? ring.reverse() : ring;
}

/**
 * Average direction of the faces around each corner.
 *
 * @param work Bevel state.
 * @returns Direction by corner.
 */
function solidScriptMeshBevelOutwards(work: SolidScriptMeshBevelWork): Map<number, THREE.Vector3> {
  const outwards = new Map<number, THREE.Vector3>();
  for (const loop of work.loops) {
    const normal = solidScriptMeshLoopNormal(work.points, loop);
    for (const corner of loop) outwards.set(corner, (outwards.get(corner) ?? new THREE.Vector3()).add(normal));
  }
  return outwards;
}

/**
 * Bevels edges and corners of a mesh with one flat cut each: every edge that
 * meets a bevelled corner gets a new corner Distance along it, bevelled edges
 * become strips, and corners left open get a face. Corners at the same place
 * are joined first. Faces the bevel changed get automatic texture coordinates.
 *
 * @param mesh Mesh.
 * @param picks Edges and corners to bevel.
 * @returns Bevelled mesh, the numbers of the faces it made and how many edges
 *   on an open border it left alone.
 */
export function solidScriptMeshBevel(
  mesh: SolidScriptShapeMesh,
  picks: readonly SolidScriptMeshBevelPick[],
): SolidScriptMeshBevelled {
  const welded = solidScriptMeshBevelWeld(mesh);
  const work: SolidScriptMeshBevelWork = {
    points: welded.points,
    loops: welded.loops,
    twins: solidScriptMeshBevelTwins(welded.loops),
    edges: new Set(),
    distances: new Map(),
    slides: new Map(),
  };
  const skipped = solidScriptMeshBevelPicks(work, picks, welded.placeOf);
  return { ...solidScriptMeshBevelBuild(mesh, work), skipped };
}

/**
 * Keeps the texture coordinates of a face the bevel left as it was.
 *
 * @param mesh Mesh before.
 * @param work Bevel state.
 * @param loop New corners of the face, per spot.
 * @param face Face number.
 * @returns Coordinates, or null for automatic ones.
 */
function solidScriptMeshBevelUvs(
  mesh: SolidScriptShapeMesh,
  work: SolidScriptMeshBevelWork,
  loop: readonly number[][],
  face: number,
): SolidScriptShapeMesh['uvs'][number] {
  const before = work.loops[face] ?? [];
  const same =
    mesh.faces[face]?.length === loop.length &&
    loop.every((entry, spot) => entry.length === 1 && entry[0] === before[spot]);
  return same ? (mesh.uvs[face] ?? null) : null;
}

/**
 * Builds the bevelled mesh from the worked-out state.
 *
 * @param mesh Mesh before.
 * @param work Bevel state with its picks.
 * @returns Bevelled mesh and the numbers of the faces it made.
 */
function solidScriptMeshBevelBuild(
  mesh: SolidScriptShapeMesh,
  work: SolidScriptMeshBevelWork,
): Omit<SolidScriptMeshBevelled, 'skipped'> {
  const outwards = solidScriptMeshBevelOutwards(work);
  const corners = solidScriptMeshBevelCorners(work);
  const kept = corners.map((loop) => loop.flat());
  const strips = [...work.edges].map((key) => solidScriptMeshBevelStrip(work, corners, key));
  const patches = [...work.distances.keys()].flatMap((corner) => {
    const patch = solidScriptMeshBevelPatch(work, corners, corner, outwards.get(corner) ?? new THREE.Vector3());
    return patch ? [patch] : [];
  });
  const made = [...strips, ...patches];
  const uvs = corners.map((loop, face) => solidScriptMeshBevelUvs(mesh, work, loop, face));
  return {
    mesh: { ...mesh, points: work.points, faces: [...kept, ...made], uvs: [...uvs, ...made.map(() => null)] },
    made: made.map((_, index) => kept.length + index),
  };
}
