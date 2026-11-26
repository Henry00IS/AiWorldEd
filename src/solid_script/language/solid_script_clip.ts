import * as THREE from 'three';
import { solidScriptBodySolid } from './solid_script_body.js';
import { solidScriptBodyClip } from './solid_script_body_clip.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import {
  solidScriptMeshChecked,
  solidScriptMeshLoopNormal,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from './solid_script_mesh.js';
import type { SolidScriptFaceTag, SolidScriptShapeSolid } from './solid_script_shape.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptVectorThreeRequire } from './solid_script_vector.js';

/**
 * The tag Clip gives the faces it makes over a cut, so Where can pick or skip
 * them.
 */
export const SOLID_SCRIPT_CLIP_TAG = 'Cut';

/** A plane that cuts a solid or mesh, given in script space. */
export interface SolidScriptClipPlane {
  /** Unit direction; the part it points toward is cut away. */
  normal: THREE.Vector3;
  /** Offset: points p with normal · p = constant lie on the plane. */
  constant: number;
}

/**
 * Reads Through and Normal from a Clip line and builds the cutting plane.
 *
 * @param run Running Clip line.
 * @returns Plane in script space.
 */
export function solidScriptClipPlane(run: SolidScriptBlockRun): SolidScriptClipPlane {
  const through = solidScriptClipVector(run, 'through', 'Through');
  const normal = solidScriptClipVector(run, 'normal', 'Normal');
  if (normal.lengthSq() < SOLID_SCRIPT_GEOMETRY_EPSILON * SOLID_SCRIPT_GEOMETRY_EPSILON)
    throw new Error(
      'Normal must not be 0, 0, 0; write a direction such as 0, 1, 0, the way the part you cut away faces',
    );
  const unit = normal.clone().normalize();
  return { normal: unit, constant: unit.dot(through) };
}

/**
 * Cuts a solid or a mesh with a plane and keeps the part behind it. A solid
 * stays a solid; a mesh stays a mesh.
 *
 * @param leaf Solid or mesh.
 * @param plane Cutting plane.
 * @param label Command, for messages.
 * @returns The cut shape, or the same leaf when the plane misses it.
 */
export function solidScriptClipLeaf(
  leaf: SolidScriptGeometryLeaf,
  plane: SolidScriptClipPlane,
  label: string,
): SolidScriptGeometryLeaf {
  return leaf.kind === 'mesh' ? solidScriptClipMesh(leaf, plane, label) : solidScriptClipSolid(leaf, plane, label);
}

/**
 * Reads a three-number vector field.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption.
 * @returns Vector.
 */
function solidScriptClipVector(run: SolidScriptBlockRun, key: string, label: string): THREE.Vector3 {
  return solidScriptVectorThreeRequire(
    run.value(key),
    `${label} needs a vector as x, y, z, such as 0, 1, 0, not ${String(run.value(key))}`,
  );
}

/**
 * Cuts a convex solid with a plane and rebuilds it as a convex solid.
 *
 * @param solid Solid.
 * @param plane Cutting plane.
 * @param label Command, for messages.
 * @returns The cut solid, or the same solid when the plane misses it.
 */
function solidScriptClipSolid(
  solid: SolidScriptShapeSolid,
  plane: SolidScriptClipPlane,
  label: string,
): SolidScriptShapeSolid {
  const fate = solidScriptClipFate(solid.points, plane);
  if (fate === 'keep') return solid;
  if (fate === 'gone') throw new Error(solidScriptClipGone(label, solid.label, 'solid'));
  const body = solidScriptBodyClip(solid, plane.normal, plane.constant);
  if (!solidScriptBodySolid(body)) throw new Error(solidScriptClipFlat(label, solid.label, 'solid'));
  const faceTags = solidScriptClipTags(body.points, body.faces, plane, solid.faceTags);
  return { ...solid, points: body.points, faces: body.faces, clippedBy: plane, faceTags };
}

/**
 * Cuts a mesh with a plane, keeps the faces behind it, and caps the cut with
 * new faces so a closed mesh stays closed.
 *
 * @param mesh Mesh.
 * @param plane Cutting plane.
 * @param label Command, for messages.
 * @returns The cut mesh, or the same mesh when the plane misses it.
 */
function solidScriptClipMesh(
  mesh: SolidScriptShapeMesh,
  plane: SolidScriptClipPlane,
  label: string,
): SolidScriptShapeMesh {
  const fate = solidScriptClipFate(mesh.points, plane);
  if (fate === 'keep') return mesh;
  if (fate === 'gone') throw new Error(solidScriptClipGone(label, mesh.label, 'mesh'));
  const cut = solidScriptClipMeshFaces(mesh, plane);
  if (cut.faces.length === 0) throw new Error(solidScriptClipGone(label, mesh.label, 'mesh'));
  const capped = solidScriptClipMeshCap(cut, plane);
  return solidScriptMeshChecked({
    ...mesh,
    points: capped.points,
    faces: capped.faces,
    uvs: capped.uvs,
    faceTags: solidScriptClipTags(capped.points, capped.faces, plane, mesh.faceTags),
  });
}

/**
 * Face tags of a cut shape: the tags it had on the part that stays, plus Cut on
 * every face that lies on the plane and faces the part cut away, the faces the
 * cut made. A tag sits on the middle of a face's first edge, which the face
 * always holds.
 *
 * @param points Corners of the cut shape.
 * @param faces Faces as corner indices.
 * @param plane Cutting plane.
 * @param kept Tags the shape had, if any.
 * @returns Tags.
 */
function solidScriptClipTags(
  points: readonly THREE.Vector3[],
  faces: readonly (readonly number[])[],
  plane: SolidScriptClipPlane,
  kept: readonly SolidScriptFaceTag[] | undefined,
): SolidScriptFaceTag[] {
  const tags = (kept ?? []).filter((tag) => solidScriptClipSide(tag.point, plane) <= SOLID_SCRIPT_GEOMETRY_EPSILON);
  for (const face of faces) {
    const corners = face.flatMap((index) => points[index] ?? []);
    const [first, second] = corners;
    if (!first || !second || corners.length < 3) continue;
    if (corners.some((corner) => Math.abs(solidScriptClipSide(corner, plane)) > SOLID_SCRIPT_GEOMETRY_EPSILON))
      continue;
    if (solidScriptMeshLoopNormal(points, face).normalize().dot(plane.normal) < 0.99) continue;
    tags.push({ point: first.clone().lerp(second, 0.5), normal: plane.normal.clone(), tag: SOLID_SCRIPT_CLIP_TAG });
  }
  return tags;
}

/**
 * Tells whether every point of a shape is kept, cut away, or mixed.
 *
 * @param points Corner points.
 * @param plane Cutting plane.
 * @returns Fate.
 */
function solidScriptClipFate(points: readonly THREE.Vector3[], plane: SolidScriptClipPlane): 'keep' | 'gone' | 'cut' {
  const sides = points.map((point) => solidScriptClipSide(point, plane));
  if (sides.every((side) => side <= SOLID_SCRIPT_GEOMETRY_EPSILON)) return 'keep';
  if (sides.every((side) => side > SOLID_SCRIPT_GEOMETRY_EPSILON)) return 'gone';
  return 'cut';
}

/**
 * Signed distance of a point to a clip plane; zero is on the plane, and a
 * positive value is on the side that is cut away.
 *
 * @param point Point.
 * @param plane Cutting plane.
 * @returns Signed distance in metres.
 */
function solidScriptClipSide(point: THREE.Vector3, plane: SolidScriptClipPlane): number {
  return plane.normal.dot(point) - plane.constant;
}

/**
 * Message when a plane cuts a shape away entirely.
 *
 * @param label Command.
 * @param name Shape label.
 * @param kind Solid or mesh, for the message.
 * @returns Message.
 */
function solidScriptClipGone(label: string, name: string, kind: 'solid' | 'mesh'): string {
  const who = name.trim() === '' ? `this ${kind}` : name;
  return `${label} cut the whole of ${who} away; move Through or turn Normal so some of it stays, such as the side Normal points away from`;
}

/**
 * Message when a plane leaves only a flat remnant of a brush.
 *
 * @param label Command.
 * @param name Shape label.
 * @param kind Solid or mesh, for the message.
 * @returns Message.
 */
function solidScriptClipFlat(label: string, name: string, kind: 'solid' | 'mesh'): string {
  const who = name.trim() === '' ? `this ${kind}` : name;
  return `${label} left a flat shape from ${who}; move Through or turn Normal so the part that stays has some thickness`;
}

/** A mesh being rebuilt as faces are clipped. */
interface SolidScriptClipBuild {
  points: THREE.Vector3[];
  faces: number[][];
  uvs: (SolidScriptUv[] | null)[];
  keys: Map<string, number>;
  cuts: [number, number][];
}

/**
 * Clips every face of a mesh and records the new edges that lie on the plane.
 *
 * @param mesh Mesh.
 * @param plane Cutting plane.
 * @returns Partial mesh and cut edges.
 */
function solidScriptClipMeshFaces(mesh: SolidScriptShapeMesh, plane: SolidScriptClipPlane): SolidScriptClipBuild {
  const build: SolidScriptClipBuild = { points: [], faces: [], uvs: [], keys: new Map(), cuts: [] };
  mesh.faces.forEach((loop, index) => solidScriptClipMeshFace(mesh, loop, mesh.uvs[index] ?? null, plane, build));
  return build;
}

/**
 * Clips one face and adds the kept polygon, if any, to the build.
 *
 * @param mesh Mesh.
 * @param loop Face corners.
 * @param uvs Face texture coordinates, or none.
 * @param plane Cutting plane.
 * @param build Mesh being rebuilt.
 */
function solidScriptClipMeshFace(
  mesh: SolidScriptShapeMesh,
  loop: readonly number[],
  uvs: SolidScriptUv[] | null,
  plane: SolidScriptClipPlane,
  build: SolidScriptClipBuild,
): void {
  const kept = solidScriptClipPolygon(mesh.points, loop, uvs, plane);
  if (!kept || kept.corners.length < 3) return;
  const face = kept.corners.map((corner) => solidScriptClipPoint(build, corner));
  build.faces.push(face);
  build.uvs.push(kept.uvs);
  solidScriptClipRecordCuts(build, face, kept.born);
}

/** One kept corner of a clipped polygon, and whether the clip made it. */
interface SolidScriptClipCorner {
  corners: THREE.Vector3[];
  uvs: SolidScriptUv[] | null;
  born: ('kept' | 'cut')[];
}

/**
 * Clips a face loop against the plane and keeps the part behind it.
 *
 * @param points Mesh points.
 * @param loop Face corners.
 * @param uvs Face texture coordinates, or none.
 * @param plane Cutting plane.
 * @returns Kept polygon, or none when the face is cut away.
 */
function solidScriptClipPolygon(
  points: readonly THREE.Vector3[],
  loop: readonly number[],
  uvs: SolidScriptUv[] | null,
  plane: SolidScriptClipPlane,
): SolidScriptClipCorner | null {
  const kept: SolidScriptClipCorner = { corners: [], uvs: uvs ? [] : null, born: [] };
  loop.forEach((_, at) => solidScriptClipEdge(points, loop, uvs, plane, at, kept));
  return kept.corners.length >= 3 ? kept : null;
}

/**
 * Walks one edge of a face and appends the kept point and any crossing.
 *
 * @param points Mesh points.
 * @param loop Face corners.
 * @param uvs Face texture coordinates, or none.
 * @param plane Cutting plane.
 * @param at Index of the edge's start in the loop.
 * @param kept Polygon being built.
 */
function solidScriptClipEdge(
  points: readonly THREE.Vector3[],
  loop: readonly number[],
  uvs: SolidScriptUv[] | null,
  plane: SolidScriptClipPlane,
  at: number,
  kept: SolidScriptClipCorner,
): void {
  const ends = solidScriptClipEnds(points, loop, at);
  if (!ends) return;
  const [pa, pb] = ends;
  const da = solidScriptClipSide(pa, plane);
  const db = solidScriptClipSide(pb, plane);
  if (da <= SOLID_SCRIPT_GEOMETRY_EPSILON) solidScriptClipPush(kept, pa, uvs, at, 'kept');
  if (solidScriptClipCrosses(da, db)) solidScriptClipCrossing(kept, pa, pb, da, db, uvs, at, loop);
}

/**
 * Appends the point where an edge crosses the plane.
 *
 * @param kept Polygon being built.
 * @param pa Start of the edge.
 * @param pb End of the edge.
 * @param da Signed distance of the start.
 * @param db Signed distance of the end.
 * @param uvs Face texture coordinates, or none.
 * @param at Index of the edge's start.
 * @param loop Face corners.
 */
function solidScriptClipCrossing(
  kept: SolidScriptClipCorner,
  pa: THREE.Vector3,
  pb: THREE.Vector3,
  da: number,
  db: number,
  uvs: SolidScriptUv[] | null,
  at: number,
  loop: readonly number[],
): void {
  solidScriptClipPush(
    kept,
    pa.clone().lerp(pb, da / (da - db)),
    uvs,
    at,
    'cut',
    solidScriptClipUvLerp(uvs, at, loop, da, db),
  );
}

/**
 * Reads the two ends of a face edge.
 *
 * @param points Mesh points.
 * @param loop Face corners.
 * @param at Index of the edge's start in the loop.
 * @returns The two points, or none when an index is missing.
 */
function solidScriptClipEnds(
  points: readonly THREE.Vector3[],
  loop: readonly number[],
  at: number,
): [THREE.Vector3, THREE.Vector3] | null {
  const a = loop[at];
  const b = loop[(at + 1) % loop.length];
  const pa = a === undefined ? undefined : points[a];
  const pb = b === undefined ? undefined : points[b];
  return pa === undefined || pb === undefined ? null : [pa, pb];
}

/**
 * Tells whether an edge crosses from the kept side to the cut-away side.
 *
 * @param da Signed distance of the start.
 * @param db Signed distance of the end.
 * @returns True when the edge crosses the plane.
 */
function solidScriptClipCrosses(da: number, db: number): boolean {
  return (
    (da < -SOLID_SCRIPT_GEOMETRY_EPSILON && db > SOLID_SCRIPT_GEOMETRY_EPSILON) ||
    (db < -SOLID_SCRIPT_GEOMETRY_EPSILON && da > SOLID_SCRIPT_GEOMETRY_EPSILON)
  );
}

/**
 * Appends a kept or cut corner, and its texture coordinate when the face has
 * them.
 *
 * @param kept Polygon being built.
 * @param point Corner.
 * @param uvs Face texture coordinates, or none.
 * @param at Index of the edge's start.
 * @param born Whether the clip made this corner.
 * @param cutUv Texture coordinate of a cut corner, when given.
 */
function solidScriptClipPush(
  kept: SolidScriptClipCorner,
  point: THREE.Vector3,
  uvs: SolidScriptUv[] | null,
  at: number,
  born: 'kept' | 'cut',
  cutUv?: SolidScriptUv | null,
): void {
  kept.corners.push(point.clone());
  kept.born.push(born);
  if (!kept.uvs) return;
  const uv = born === 'cut' ? (cutUv ?? null) : (uvs?.[at] ?? null);
  if (!uv) {
    kept.uvs = null;
    return;
  }
  kept.uvs.push([uv[0], uv[1]]);
}

/**
 * Interpolates texture coordinates at a plane crossing, or none when the face
 * has none.
 *
 * @param uvs Face texture coordinates, or none.
 * @param at Index of the edge's start.
 * @param loop Face corners, for the wrap to the next corner.
 * @param da Signed distance of the start.
 * @param db Signed distance of the end.
 * @returns Texture coordinate, or none.
 */
function solidScriptClipUvLerp(
  uvs: SolidScriptUv[] | null,
  at: number,
  loop: readonly number[],
  da: number,
  db: number,
): SolidScriptUv | null {
  const start = uvs?.[at];
  const end = uvs?.[(at + 1) % loop.length];
  if (!start || !end) return null;
  const t = da / (da - db);
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
}

/**
 * Adds a point to the build, welding ones that fall on the same spot, and
 * returns its index.
 *
 * @param build Mesh being rebuilt.
 * @param point Corner.
 * @param cut True when the clip made this corner.
 * @returns Point index.
 */
function solidScriptClipPoint(build: SolidScriptClipBuild, point: THREE.Vector3): number {
  const key = solidScriptClipKey(point);
  const known = build.keys.get(key);
  if (known !== undefined) return known;
  const index = build.points.length;
  build.points.push(point.clone());
  build.keys.set(key, index);
  return index;
}

/**
 * Records each new edge of a clipped face that lies on the plane, for capping.
 *
 * @param build Mesh being rebuilt.
 * @param face Kept face indices.
 * @param born Whether each corner was made by the clip.
 */
function solidScriptClipRecordCuts(
  build: SolidScriptClipBuild,
  face: readonly number[],
  born: readonly ('kept' | 'cut')[],
): void {
  face.forEach((index, at) => {
    const next = (at + 1) % face.length;
    const other = face[next];
    const a = born[at];
    const b = born[next];
    if (other === undefined || a !== 'cut' || b !== 'cut' || index === other) return;
    build.cuts.push(index < other ? [index, other] : [other, index]);
  });
}

/**
 * A stable key for welding points that fall on the same spot.
 *
 * @param point Point.
 * @returns Key.
 */
function solidScriptClipKey(point: THREE.Vector3): string {
  const scale = 1 / SOLID_SCRIPT_GEOMETRY_EPSILON;
  return `${Math.round(point.x * scale)}:${Math.round(point.y * scale)}:${Math.round(point.z * scale)}`;
}

/**
 * Adds a cap face for each closed loop of cut edges, facing along the plane
 * normal so a closed mesh stays closed.
 *
 * @param build Clipped mesh.
 * @param plane Cutting plane.
 * @returns Mesh with cap faces.
 */
function solidScriptClipMeshCap(build: SolidScriptClipBuild, plane: SolidScriptClipPlane): SolidScriptClipBuild {
  for (const loop of solidScriptClipLoops(build.cuts)) {
    if (loop.length < 3) continue;
    const face = solidScriptClipOrient(build.points, loop, plane.normal);
    build.faces.push(face);
    build.uvs.push(null);
  }
  return build;
}

/**
 * Joins cut edges into simple loops. Open chains, such as a cut through an open
 * mesh, are left un-capped.
 *
 * @param cuts Undirected cut edges.
 * @returns Closed loops of point indices.
 */
function solidScriptClipLoops(cuts: readonly [number, number][]): number[][] {
  const unused = cuts.filter(
    (edge, at) => cuts.findIndex((other) => other[0] === edge[0] && other[1] === edge[1]) === at,
  );
  const loops: number[][] = [];
  while (unused.length > 0) {
    const loop = solidScriptClipWalk(unused);
    if (loop) loops.push(loop);
  }
  return loops;
}

/**
 * Walks one chain of unused cut edges and returns it when it closes.
 *
 * @param unused Edges still to walk, mutated as they are taken.
 * @returns A closed loop, or null when the chain is open.
 */
function solidScriptClipWalk(unused: [number, number][]): number[] | null {
  const first = unused.shift();
  if (!first) return null;
  const loop = [first[0], first[1]];
  while (unused.length > 0) {
    const last = loop[loop.length - 1];
    if (last === undefined) return null;
    const at = unused.findIndex((edge) => edge[0] === last || edge[1] === last);
    if (at < 0) return null;
    const [taken] = unused.splice(at, 1);
    if (!taken) return null;
    const next = taken[0] === last ? taken[1] : taken[0];
    if (next === loop[0]) return loop.length >= 3 ? loop : null;
    if (loop.includes(next)) return null;
    loop.push(next);
  }
  return null;
}

/**
 * Turns a cap loop so it faces along the given direction.
 *
 * @param points Mesh points.
 * @param loop Loop of point indices.
 * @param normal Way the cap should face.
 * @returns Oriented loop.
 */
function solidScriptClipOrient(
  points: readonly THREE.Vector3[],
  loop: readonly number[],
  normal: THREE.Vector3,
): number[] {
  const face = [...loop];
  const way = solidScriptMeshLoopNormal(points, face);
  return way.dot(normal) < 0 ? face.reverse() : face;
}
