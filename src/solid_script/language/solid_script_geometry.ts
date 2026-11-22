import * as THREE from 'three';
import { solidScriptBodyPrism, type SolidScriptBody } from './solid_script_body.js';
import { solidScriptBodyClip } from './solid_script_body_clip.js';
import { SOLID_SCRIPT_AXES_FACING, SOLID_SCRIPT_AXES_UP, solidScriptAxesHeight } from './solid_script_axes.js';
import {
  solidScriptMeshChecked,
  solidScriptMeshLoopCenter,
  solidScriptMeshLoopNormal,
  type SolidScriptShapeMesh,
} from './solid_script_mesh.js';
import {
  solidScriptShapeLeavesPositive,
  type SolidScriptShape,
  type SolidScriptShapeLeaf,
  type SolidScriptShapeSolid,
} from './solid_script_shape.js';

/** Closest two points may be to count as the same, in metres. */
export const SOLID_SCRIPT_GEOMETRY_EPSILON = 1e-5;

/**
 * How far, as a cosine, a face may lean from straight up and still count as a
 * top.
 */
const SOLID_SCRIPT_GEOMETRY_LEVEL = 0.7;

/** A solid or mesh the geometry lookups read faces from. */
export type SolidScriptGeometryLeaf = SolidScriptShapeSolid | SolidScriptShapeMesh;

/** Facts about one face of the shapes built so far. */
export interface SolidScriptFaceFacts {
  /** Number of the face among all faces read, from 0. */
  index: number;
  /** Solid or mesh it belongs to. */
  leaf: SolidScriptGeometryLeaf;
  /** Corners in order around the outside. */
  corners: THREE.Vector3[];
  center: THREE.Vector3;
  /** Unit direction it faces. */
  normal: THREE.Vector3;
  /** Along the face, level with the ground where it can be. */
  across: THREE.Vector3;
  /** Along the face, at right angles to across, upwards where it can be. */
  up: THREE.Vector3;
  width: number;
  height: number;
  area: number;
  /** Names, plainest first, such as Top then Step Tread. */
  tags: string[];
}

/** Facts about one corner point. */
export interface SolidScriptVertexFacts {
  index: number;
  position: THREE.Vector3;
  /** Average direction of the faces around it. */
  normal: THREE.Vector3;
}

/** Facts about one edge. */
export interface SolidScriptEdgeFacts {
  index: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  center: THREE.Vector3;
  length: number;
  /** Unit direction from start to end. */
  direction: THREE.Vector3;
  /** The faces that meet at it: the first, and the second when there is one. */
  faces: [SolidScriptFaceFacts, SolidScriptFaceFacts | null];
}

/**
 * Returns the solids and meshes of shapes: the kept shapes of each joined list;
 * flat outlines have no faces.
 *
 * @param shapes Shapes.
 * @returns Leaves.
 */
export function solidScriptGeometryLeaves(shapes: readonly SolidScriptShape[]): SolidScriptGeometryLeaf[] {
  return shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .filter((leaf): leaf is SolidScriptGeometryLeaf => leaf.kind !== 'polygon');
}

const SOLID_SCRIPT_MESH_OF = new WeakMap<SolidScriptGeometryLeaf, SolidScriptShapeMesh>();
const SOLID_SCRIPT_FACES_OF = new WeakMap<SolidScriptGeometryLeaf, SolidScriptFaceFacts[]>();
const SOLID_SCRIPT_EDGES_OF = new WeakMap<SolidScriptGeometryLeaf, SolidScriptEdgeCache>();
const SOLID_SCRIPT_VERTICES_OF = new WeakMap<SolidScriptGeometryLeaf, SolidScriptVertexCache>();

/** Kept edges of one solid or mesh, also grouped by the line they lie on. */
interface SolidScriptEdgeCache {
  list: SolidScriptEdgeFacts[];
  along: Map<string, SolidScriptEdgeFacts[]>;
}

/** Kept corners of one solid or mesh, also grouped by where they are. */
interface SolidScriptVertexCache {
  list: SolidScriptVertexFacts[];
  at: Map<string, SolidScriptVertexFacts[]>;
}

/**
 * Returns a kept value for a solid or mesh, making it on the first read. A
 * later replacement of the leaf is a new object, so it starts empty, the same
 * as faces.
 *
 * @param store Kept values, keyed by the solid or mesh itself.
 * @param leaf Solid or mesh.
 * @param make Value of a leaf not yet kept.
 * @returns Kept value.
 */
function solidScriptGeometryKept<T>(
  store: WeakMap<SolidScriptGeometryLeaf, T>,
  leaf: SolidScriptGeometryLeaf,
  make: (leaf: SolidScriptGeometryLeaf) => T,
): T {
  const kept = store.get(leaf);
  if (kept) return kept;
  const value = make(leaf);
  store.set(leaf, value);
  return value;
}

/**
 * Joins the kept facts of every solid or mesh, numbering them from 0 in build
 * order.
 *
 * @param leaves Solids and meshes.
 * @param of Facts of one leaf.
 * @param at Facts with a joined number.
 * @returns Joined facts.
 */
function solidScriptGeometryFactsJoin<T extends { index: number }>(
  leaves: readonly SolidScriptGeometryLeaf[],
  of: (leaf: SolidScriptGeometryLeaf) => readonly T[],
  at: (item: T, index: number) => T,
): T[] {
  const joined: T[] = [];
  for (const leaf of leaves) for (const item of of(leaf)) joined.push(at(item, joined.length));
  return joined;
}

/**
 * Returns the faces of a solid or mesh as loops of points: a solid's own faces,
 * kept so later face, edge or UV reads share them.
 *
 * @param leaf Solid or mesh.
 * @returns Mesh with the same faces.
 */
export function solidScriptGeometryMesh(leaf: SolidScriptGeometryLeaf): SolidScriptShapeMesh {
  if (leaf.kind === 'mesh') return leaf;
  const kept = SOLID_SCRIPT_MESH_OF.get(leaf);
  if (kept) return kept;
  const mesh: SolidScriptShapeMesh = {
    kind: 'mesh',
    label: leaf.label,
    points: leaf.points,
    faces: leaf.faces,
    uvs: leaf.faces.map(() => null),
  };
  if (leaf.faceTags) mesh.faceTags = leaf.faceTags;
  SOLID_SCRIPT_MESH_OF.set(leaf, mesh);
  return mesh;
}

/**
 * Tells whether a point lies on a face: on its plane and inside its outline,
 * edges included.
 *
 * @param corners Corners of the face in order.
 * @param normal Unit direction of the face.
 * @param point Point.
 * @returns True when the face holds the point.
 */
export function solidScriptGeometryFaceHolds(
  corners: readonly THREE.Vector3[],
  normal: THREE.Vector3,
  point: THREE.Vector3,
): boolean {
  const first = corners[0];
  if (!first || Math.abs(point.clone().sub(first).dot(normal)) > SOLID_SCRIPT_GEOMETRY_PLANE) return false;
  const { across, up } = solidScriptGeometryFrame(normal);
  const flat = corners.map((corner) => [corner.dot(across), corner.dot(up)] as const);
  const x = point.dot(across);
  const y = point.dot(up);
  let inside = false;
  for (let at = 0, before = flat.length - 1; at < flat.length; before = at++) {
    const [ax, ay] = flat[at]!;
    const [bx, by] = flat[before]!;
    const along = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    const length = Math.hypot(bx - ax, by - ay);
    const onEdge =
      Math.abs(along) <= SOLID_SCRIPT_GEOMETRY_PLANE * Math.max(length, 1) &&
      x >= Math.min(ax, bx) - SOLID_SCRIPT_GEOMETRY_PLANE &&
      x <= Math.max(ax, bx) + SOLID_SCRIPT_GEOMETRY_PLANE &&
      y >= Math.min(ay, by) - SOLID_SCRIPT_GEOMETRY_PLANE &&
      y <= Math.max(ay, by) + SOLID_SCRIPT_GEOMETRY_PLANE;
    if (onEdge) return true;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** How far off its plane a point may be and still count as on a face, in metres. */
const SOLID_SCRIPT_GEOMETRY_PLANE = 1e-5;

/**
 * Works out the two directions along a face: across is level with the ground
 * when the face is not flat on it, up runs up the face.
 *
 * @param normal Unit face direction.
 * @returns Across and up.
 */
export function solidScriptGeometryFrame(normal: THREE.Vector3): { across: THREE.Vector3; up: THREE.Vector3 } {
  const height = solidScriptAxesHeight(normal);
  const world = Math.abs(height) > 0.999 ? SOLID_SCRIPT_AXES_FACING['Back']! : SOLID_SCRIPT_AXES_UP;
  const across = new THREE.Vector3().crossVectors(world, normal).normalize();
  if (height > 0.999) across.set(1, 0, 0);
  if (height < -0.999) across.set(-1, 0, 0);
  const up = new THREE.Vector3().crossVectors(normal, across).normalize();
  return { across, up };
}

/**
 * Returns the matrix that stands a shape on a face the way it stands on the
 * ground: its origin at the face center, X across, Y out of the face and Z down
 * the face (toward its front).
 *
 * @param face Face.
 * @returns Matrix.
 */
export function solidScriptGeometryFaceMatrix(face: SolidScriptFaceFacts): THREE.Matrix4 {
  return new THREE.Matrix4().makeBasis(face.across, face.normal, face.up.clone().negate()).setPosition(face.center);
}

/**
 * Names a face from the way it points and what built it.
 *
 * @param normal Unit face direction.
 * @param role What built the shape, such as "stairs +x".
 * @returns Names, plainest first.
 */
export function solidScriptGeometryTags(normal: THREE.Vector3, role: string | undefined): string[] {
  const height = solidScriptAxesHeight(normal);
  const level =
    height > SOLID_SCRIPT_GEOMETRY_LEVEL ? 'Top' : height < -SOLID_SCRIPT_GEOMETRY_LEVEL ? 'Bottom' : 'Side';
  const tags = [level];
  const [kind, direction] = (role ?? '').split(' ');
  if (kind === 'stairs' || kind === 'curvedStairs') {
    if (level === 'Top') tags.push('Step Tread');
    const climb = SOLID_SCRIPT_GEOMETRY_CLIMB[direction ?? ''];
    if (level === 'Side' && climb && normal.dot(climb) < -0.9) tags.push('Riser');
  }
  if (kind === 'column' && level !== 'Side') tags.push('Cap');
  return tags;
}

/** Direction each Stairs Ascend value climbs, in script space. */
const SOLID_SCRIPT_GEOMETRY_CLIMB: Readonly<Record<string, THREE.Vector3>> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
};

/**
 * Reads every face of shapes, numbered from 0 in build order.
 *
 * @param shapes Shapes.
 * @returns Faces.
 */
export function solidScriptGeometryFaces(shapes: readonly SolidScriptShape[]): SolidScriptFaceFacts[] {
  return solidScriptGeometryFactsJoin(solidScriptGeometryLeaves(shapes), solidScriptGeometryFacesOf, (face, index) =>
    face.index === index ? face : { ...face, index },
  );
}

/**
 * Reads every face of one solid or mesh, numbered from 0, kept after the first
 * read.
 *
 * @param leaf Solid or mesh.
 * @returns Faces.
 */
function solidScriptGeometryFacesOf(leaf: SolidScriptGeometryLeaf): SolidScriptFaceFacts[] {
  return solidScriptGeometryKept(SOLID_SCRIPT_FACES_OF, leaf, (item) => {
    const mesh = solidScriptGeometryMesh(item);
    return mesh.faces.map((loop, index) => solidScriptGeometryFace(mesh.points, loop, item, index));
  });
}

/**
 * Works out the facts of one face.
 *
 * @param points Mesh points.
 * @param loop Point numbers around the face.
 * @param leaf Solid or mesh it belongs to.
 * @param index Face number.
 * @returns Facts.
 */
function solidScriptGeometryFace(
  points: readonly THREE.Vector3[],
  loop: readonly number[],
  leaf: SolidScriptGeometryLeaf,
  index: number,
): SolidScriptFaceFacts {
  const corners = loop.map((corner) => points[corner]!.clone());
  const normal = solidScriptMeshLoopNormal(points, loop);
  const center = solidScriptMeshLoopCenter(points, loop);
  const { across, up } = solidScriptGeometryFrame(normal);
  const spans = (axis: THREE.Vector3): number => {
    const along = corners.map((corner) => corner.clone().sub(center).dot(axis));
    return Math.max(...along) - Math.min(...along);
  };
  let area = 0;
  for (let corner = 1; corner + 1 < corners.length; corner++)
    area +=
      new THREE.Vector3()
        .crossVectors(corners[corner]!.clone().sub(corners[0]!), corners[corner + 1]!.clone().sub(corners[0]!))
        .length() / 2;
  const role = leaf.kind === 'solid' ? leaf.role : undefined;
  const tags = solidScriptGeometryTags(normal, role);
  for (const tag of leaf.faceTags ?? [])
    if (
      tag.normal.dot(normal) > 0.9999 &&
      !tags.includes(tag.tag) &&
      solidScriptGeometryFaceHolds(corners, normal, tag.point)
    )
      tags.push(tag.tag);
  return {
    index,
    leaf,
    corners,
    center,
    normal,
    across,
    up,
    width: spans(across),
    height: spans(up),
    area,
    tags,
  };
}

/**
 * Reads every corner point of shapes, each once per solid or mesh.
 *
 * @param shapes Shapes.
 * @returns Points.
 */
export function solidScriptGeometryVertices(shapes: readonly SolidScriptShape[]): SolidScriptVertexFacts[] {
  return solidScriptGeometryFactsJoin(
    solidScriptGeometryLeaves(shapes),
    solidScriptGeometryVerticesOf,
    (vertex, index) => (vertex.index === index ? vertex : { ...vertex, index }),
  );
}

/**
 * Reads every corner point of one solid or mesh, kept after the first read.
 *
 * @param leaf Solid or mesh.
 * @returns Points.
 */
function solidScriptGeometryVerticesOf(leaf: SolidScriptGeometryLeaf): SolidScriptVertexFacts[] {
  return solidScriptGeometryVerticesCache(leaf).list;
}

/**
 * Returns the kept corner points of a solid or mesh, grouped by where they are.
 *
 * @param leaf Solid or mesh.
 * @returns Kept corners.
 */
function solidScriptGeometryVerticesCache(leaf: SolidScriptGeometryLeaf): SolidScriptVertexCache {
  return solidScriptGeometryKept(SOLID_SCRIPT_VERTICES_OF, leaf, solidScriptGeometryVerticesMake);
}

/**
 * Works out the corner points of a solid or mesh, using the kept faces for
 * their directions, and groups them by where they are.
 *
 * @param leaf Solid or mesh.
 * @returns Kept corners.
 */
function solidScriptGeometryVerticesMake(leaf: SolidScriptGeometryLeaf): SolidScriptVertexCache {
  const mesh = solidScriptGeometryMesh(leaf);
  const normals = mesh.points.map(() => new THREE.Vector3());
  for (const face of solidScriptGeometryFacesOf(leaf))
    for (const corner of mesh.faces[face.index] ?? []) normals[corner]!.add(face.normal);
  const list = mesh.points.map((position, index) => ({
    index,
    position: position.clone(),
    normal: normals[index]!.normalize(),
  }));
  return { list, at: solidScriptGeometryVerticesAtMap(list) };
}

/**
 * Groups corner points by where they are.
 *
 * @param vertices Corner points.
 * @returns Groups.
 */
function solidScriptGeometryVerticesAtMap(
  vertices: readonly SolidScriptVertexFacts[],
): Map<string, SolidScriptVertexFacts[]> {
  const at = new Map<string, SolidScriptVertexFacts[]>();
  for (const vertex of vertices) {
    const key = solidScriptGeometryPointKey(vertex.position);
    const group = at.get(key);
    if (group) group.push(vertex);
    else at.set(key, [vertex]);
  }
  return at;
}

/**
 * Reads the kept corners of a solid or mesh that sit at a point.
 *
 * @param leaf Solid or mesh.
 * @param position Point.
 * @returns Corners there.
 */
export function solidScriptGeometryVerticesAt(
  leaf: SolidScriptGeometryLeaf,
  position: THREE.Vector3,
): SolidScriptVertexFacts[] {
  return solidScriptGeometryVerticesCache(leaf).at.get(solidScriptGeometryPointKey(position)) ?? [];
}

/**
 * Reads every edge of shapes, each once, with the faces that meet there.
 *
 * @param shapes Shapes.
 * @returns Edges.
 */
export function solidScriptGeometryEdges(shapes: readonly SolidScriptShape[]): SolidScriptEdgeFacts[] {
  return solidScriptGeometryEdgesJoin(solidScriptGeometryLeaves(shapes));
}

/**
 * Reads the edges of one solid or mesh, kept after the first read, from the
 * kept faces rather than building the faces again.
 *
 * @param leaf Solid or mesh.
 * @returns Edges.
 */
function solidScriptGeometryEdgesOf(leaf: SolidScriptGeometryLeaf): SolidScriptEdgeFacts[] {
  return solidScriptGeometryEdgesCache(leaf).list;
}

/**
 * Returns the kept edges of a solid or mesh, grouped by the line they lie on.
 *
 * @param leaf Solid or mesh.
 * @returns Kept edges.
 */
function solidScriptGeometryEdgesCache(leaf: SolidScriptGeometryLeaf): SolidScriptEdgeCache {
  return solidScriptGeometryKept(SOLID_SCRIPT_EDGES_OF, leaf, solidScriptGeometryEdgesMake);
}

/**
 * Works out the edges of a solid or mesh from the kept faces, and groups them
 * by the line they lie on.
 *
 * @param leaf Solid or mesh.
 * @returns Kept edges.
 */
function solidScriptGeometryEdgesMake(leaf: SolidScriptGeometryLeaf): SolidScriptEdgeCache {
  const list = solidScriptGeometryFaceEdges(solidScriptGeometryFacesOf(leaf));
  return { list, along: solidScriptGeometryEdgesAlongMap(list) };
}

/**
 * Groups edges by the line they lie on.
 *
 * @param edges Edges.
 * @returns Groups.
 */
function solidScriptGeometryEdgesAlongMap(edges: readonly SolidScriptEdgeFacts[]): Map<string, SolidScriptEdgeFacts[]> {
  const along = new Map<string, SolidScriptEdgeFacts[]>();
  for (const edge of edges) {
    const key = solidScriptGeometryLineKey(edge.start, edge.direction);
    const group = along.get(key);
    if (group) group.push(edge);
    else along.set(key, [edge]);
  }
  return along;
}

/**
 * Key of an infinite line through a point with a direction, so colinear edges
 * share one group.
 *
 * @param point A point on the line.
 * @param direction Direction along the line.
 * @returns Key.
 */
function solidScriptGeometryLineKey(point: THREE.Vector3, direction: THREE.Vector3): string {
  const dir = direction.clone();
  if (dir.lengthSq() < 1e-16) return `point:${solidScriptGeometryPointKey(point)}`;
  dir.normalize();
  solidScriptGeometryLineSign(dir);
  return `${solidScriptGeometryPointKey(dir)}:${solidScriptGeometryPointKey(
    point.clone().addScaledVector(dir, -point.dot(dir)),
  )}`;
}

/**
 * Flips a unit direction so opposite ways of the same line share a key.
 *
 * @param direction Unit direction, changed in place.
 */
function solidScriptGeometryLineSign(direction: THREE.Vector3): void {
  if (
    direction.x < -1e-5 ||
    (Math.abs(direction.x) <= 1e-5 && direction.y < -1e-5) ||
    (Math.abs(direction.x) <= 1e-5 && Math.abs(direction.y) <= 1e-5 && direction.z < 0)
  )
    direction.negate();
}

/**
 * Tells whether an edge lies on the line through a point with a direction.
 *
 * @param point A point on the line.
 * @param direction Direction along the line.
 * @param edge Edge.
 * @returns True when it does.
 */
function solidScriptGeometryLineHolds(
  point: THREE.Vector3,
  direction: THREE.Vector3,
  edge: SolidScriptEdgeFacts,
): boolean {
  const dir = direction.clone();
  if (dir.lengthSq() < 1e-16) return edge.start.distanceTo(point) < 1e-5 && edge.end.distanceTo(point) < 1e-5;
  dir.normalize();
  const off = (at: THREE.Vector3): boolean => {
    const offset = at.clone().sub(point);
    return offset.addScaledVector(dir, -offset.dot(dir)).length() < 1e-5;
  };
  return off(edge.start) && off(edge.end);
}

/**
 * Reads the kept edges of a solid or mesh that lie on the line through a point
 * with a direction. When a later move makes the key miss, it still finds them
 * by the line itself.
 *
 * @param leaf Solid or mesh.
 * @param point A point on the line.
 * @param direction Direction along the line.
 * @returns Edges on that line.
 */
export function solidScriptGeometryEdgesAlong(
  leaf: SolidScriptGeometryLeaf,
  point: THREE.Vector3,
  direction: THREE.Vector3,
): SolidScriptEdgeFacts[] {
  const cache = solidScriptGeometryEdgesCache(leaf);
  return (
    cache.along.get(solidScriptGeometryLineKey(point, direction)) ??
    cache.list.filter((edge) => solidScriptGeometryLineHolds(point, direction, edge))
  );
}

/**
 * Joins the kept edges of every solid or mesh, numbering edges and their faces
 * from 0 in build order.
 *
 * @param leaves Solids and meshes.
 * @returns Edges.
 */
function solidScriptGeometryEdgesJoin(leaves: readonly SolidScriptGeometryLeaf[]): SolidScriptEdgeFacts[] {
  const edges: SolidScriptEdgeFacts[] = [];
  let faceBase = 0;
  for (const leaf of leaves) {
    for (const edge of solidScriptGeometryEdgesOf(leaf))
      edges.push(solidScriptGeometryEdgeShifted(edge, edges.length, faceBase));
    faceBase += solidScriptGeometryFacesOf(leaf).length;
  }
  return edges;
}

/**
 * Returns an edge numbered in a joined list, with its faces numbered the same
 * way.
 *
 * @param edge Kept edge of one solid or mesh.
 * @param index Number in the joined list.
 * @param faceBase First face number of that solid or mesh.
 * @returns Edge; the kept one when the numbers already match.
 */
function solidScriptGeometryEdgeShifted(
  edge: SolidScriptEdgeFacts,
  index: number,
  faceBase: number,
): SolidScriptEdgeFacts {
  if (index === edge.index && faceBase === 0) return edge;
  const face = (item: SolidScriptFaceFacts | null): SolidScriptFaceFacts | null =>
    item && faceBase !== 0 ? { ...item, index: item.index + faceBase } : item;
  return { ...edge, index, faces: [face(edge.faces[0])!, face(edge.faces[1])] };
}

/**
 * Key of a corner point by where it is, so faces that share it find it once.
 *
 * @param point Corner.
 * @returns Key.
 */
function solidScriptGeometryPointKey(point: THREE.Vector3): string {
  return `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
}

/**
 * Reads the corner points of faces in their order around each face, a corner
 * that faces share once, pointing the average way of its faces.
 *
 * @param faces Faces.
 * @returns Corners.
 */
export function solidScriptGeometryFaceVertices(faces: readonly SolidScriptFaceFacts[]): SolidScriptVertexFacts[] {
  const found = new Map<string, SolidScriptVertexFacts>();
  for (const face of faces)
    for (const corner of face.corners) {
      const key = solidScriptGeometryPointKey(corner);
      const known = found.get(key);
      if (known) known.normal.add(face.normal);
      else found.set(key, { index: found.size, position: corner.clone(), normal: face.normal.clone() });
    }
  return [...found.values()].map((vertex) => ({ ...vertex, normal: vertex.normal.normalize() }));
}

/**
 * Reads the edges of faces in their order around each face, an edge that two
 * faces share once.
 *
 * @param faces Faces.
 * @returns Edges.
 */
export function solidScriptGeometryFaceEdges(faces: readonly SolidScriptFaceFacts[]): SolidScriptEdgeFacts[] {
  const found = new Map<string, SolidScriptEdgeFacts>();
  for (const face of faces)
    face.corners.forEach((corner, at) => {
      const next = face.corners[(at + 1) % face.corners.length]!;
      const ends = [solidScriptGeometryPointKey(corner), solidScriptGeometryPointKey(next)].sort().join('|');
      const known = found.get(ends);
      if (known) {
        known.faces[1] ??= face;
        return;
      }
      found.set(ends, {
        index: found.size,
        start: corner.clone(),
        end: next.clone(),
        center: corner.clone().add(next).multiplyScalar(0.5),
        length: corner.distanceTo(next),
        direction: next.clone().sub(corner).normalize(),
        faces: [face, null],
      });
    });
  return [...found.values()];
}

/** Ways to pick faces. */
export type SolidScriptFacePick =
  | { by: 'all' }
  | { by: 'facing'; direction: THREE.Vector3; within: number }
  | { by: 'tag'; tag: string }
  | { by: 'biggest' | 'smallest'; count: number }
  | { by: 'numbers'; numbers: readonly number[] }
  | { by: 'where'; holds: (face: SolidScriptFaceFacts) => boolean };

/**
 * Picks faces.
 *
 * @param faces Faces to pick from.
 * @param pick How to pick.
 * @returns Picked faces, in face order.
 */
export function solidScriptGeometryPick(
  faces: readonly SolidScriptFaceFacts[],
  pick: SolidScriptFacePick,
): SolidScriptFaceFacts[] {
  switch (pick.by) {
    case 'all':
      return [...faces];
    case 'facing': {
      const limit = Math.cos(THREE.MathUtils.degToRad(pick.within)) - SOLID_SCRIPT_GEOMETRY_EPSILON;
      return faces.filter((face) => face.normal.dot(pick.direction) >= limit);
    }
    case 'tag': {
      const wanted = pick.tag.trim().toLowerCase();
      return faces.filter((face) => face.tags.some((tag) => tag.toLowerCase() === wanted));
    }
    case 'biggest':
    case 'smallest': {
      const sorted = [...faces].sort((a, b) => (pick.by === 'biggest' ? b.area - a.area : a.area - b.area));
      const kept = new Set(sorted.slice(0, pick.count));
      return faces.filter((face) => kept.has(face));
    }
    case 'numbers':
      return faces.filter((face) => pick.numbers.includes(face.index));
    case 'where':
      return faces.filter(pick.holds);
  }
}

/**
 * Finds a face again in a solid or mesh, by its center and direction, after
 * other faces changed.
 *
 * @param leaf Solid or mesh.
 * @param face Face looked for.
 * @returns Face number in the mesh of the leaf, or -1.
 */
export function solidScriptGeometryFaceFind(leaf: SolidScriptGeometryLeaf, face: SolidScriptFaceFacts): number {
  const mesh = solidScriptGeometryMesh(leaf);
  return mesh.faces.findIndex(
    (loop) =>
      solidScriptMeshLoopCenter(mesh.points, loop).distanceTo(face.center) < 1e-4 &&
      solidScriptMeshLoopNormal(mesh.points, loop).dot(face.normal) > 0.9999,
  );
}

/**
 * Builds the block a face sweeps out when it is pulled along its direction: a
 * new convex solid on the face, with the face at both ends.
 *
 * @param face Face.
 * @param distance Metres, above 0.
 * @param lift Metres the block starts away from the face, along its direction.
 * @param label Command, for messages.
 * @returns Body.
 */
export function solidScriptGeometryFacePrism(
  face: SolidScriptFaceFacts,
  distance: number,
  lift: number,
  label: string,
): SolidScriptBody {
  const along = (metres: number) => face.corners.map((corner) => corner.clone().addScaledVector(face.normal, metres));
  return solidScriptBodyPrism(along(lift), along(lift + distance), label);
}

/**
 * Bevels edges of a convex solid: every edge both of whose faces are known is
 * cut off flat, its own distance along each face.
 *
 * @param solid Solid.
 * @param edges Edges to bevel, read from this solid.
 * @param distanceOf Metres along each face, per edge.
 * @returns The bevelled solid's corners and faces, and the direction and a
 *   point of every new face.
 */
export function solidScriptGeometryBevel(
  solid: SolidScriptShapeSolid,
  edges: readonly SolidScriptEdgeFacts[],
  distanceOf: (edge: SolidScriptEdgeFacts) => number,
): { body: SolidScriptBody; cuts: { normal: THREE.Vector3; point: THREE.Vector3 }[] } {
  let body: SolidScriptBody = { points: solid.points, faces: solid.faces };
  const cuts: { normal: THREE.Vector3; point: THREE.Vector3 }[] = [];
  for (const edge of edges) {
    const [first, second] = edge.faces;
    if (!second || first.normal.dot(second.normal) > 0.999) continue;
    const bisector = first.normal.clone().add(second.normal).normalize();
    const inward = second.normal
      .clone()
      .addScaledVector(first.normal, -first.normal.dot(second.normal))
      .normalize()
      .negate();
    const through = edge.start.clone().addScaledVector(inward, distanceOf(edge));
    body = solidScriptBodyClip(body, bisector, bisector.dot(through));
    cuts.push({ normal: bisector, point: through });
  }
  return { body, cuts };
}

/**
 * Insets faces of a mesh: each face gets a smaller copy of itself inside,
 * joined to its old edge by a ring of faces.
 *
 * @param mesh Mesh.
 * @param chosen Metres from the old edge to the new one, by the number of each
 *   face to inset.
 * @returns Mesh.
 */
export function solidScriptGeometryInset(
  mesh: SolidScriptShapeMesh,
  chosen: ReadonlyMap<number, number>,
): SolidScriptShapeMesh {
  const points = mesh.points.map((point) => point.clone());
  const faces: number[][] = [];
  const uvs: SolidScriptShapeMesh['uvs'] = [];
  mesh.faces.forEach((loop, faceIndex) => {
    const distance = chosen.get(faceIndex);
    if (distance === undefined) {
      faces.push([...loop]);
      uvs.push(mesh.uvs[faceIndex] ?? null);
      return;
    }
    const normal = solidScriptMeshLoopNormal(mesh.points, loop);
    const inner = loop.map((corner, at) => {
      const point = mesh.points[corner]!;
      const before = mesh.points[loop[(at + loop.length - 1) % loop.length]!]!;
      const after = mesh.points[loop[(at + 1) % loop.length]!]!;
      const inA = new THREE.Vector3().crossVectors(normal, point.clone().sub(before)).normalize();
      const inB = new THREE.Vector3().crossVectors(normal, after.clone().sub(point)).normalize();
      const bisector = inA.clone().add(inB);
      const scale = distance / Math.max(bisector.clone().normalize().dot(inA), 0.2);
      return points.push(point.clone().addScaledVector(bisector.normalize(), scale)) - 1;
    });
    loop.forEach((corner, at) => {
      const next = (at + 1) % loop.length;
      faces.push([corner, loop[next]!, inner[next]!, inner[at]!]);
      uvs.push(null);
    });
    faces.push(inner);
    uvs.push(mesh.uvs[faceIndex] ?? null);
  });
  return solidScriptMeshChecked({ ...mesh, points, faces, uvs });
}

/**
 * Takes faces out of a mesh, leaving the points.
 *
 * @param mesh Mesh.
 * @param chosen Face numbers to take out.
 * @returns Mesh.
 */
export function solidScriptGeometryFacesDelete(
  mesh: SolidScriptShapeMesh,
  chosen: ReadonlySet<number>,
): SolidScriptShapeMesh {
  return {
    ...mesh,
    faces: mesh.faces.filter((_, index) => !chosen.has(index)).map((loop) => [...loop]),
    uvs: mesh.uvs.filter((_, index) => !chosen.has(index)),
  };
}

/**
 * Joins points of a mesh closer than a distance into one, and drops faces that
 * collapse.
 *
 * @param mesh Mesh.
 * @param distance Metres.
 * @returns Mesh.
 */
export function solidScriptGeometryMerge(mesh: SolidScriptShapeMesh, distance: number): SolidScriptShapeMesh {
  const points: THREE.Vector3[] = [];
  const remap = mesh.points.map((point) => {
    const near = points.findIndex((kept) => kept.distanceTo(point) <= distance);
    if (near >= 0) return near;
    return points.push(point.clone()) - 1;
  });
  const faces: number[][] = [];
  const uvs: SolidScriptShapeMesh['uvs'] = [];
  mesh.faces.forEach((loop, index) => {
    const merged = loop
      .map((corner) => remap[corner]!)
      .filter((corner, at, all) => corner !== all[(at + all.length - 1) % all.length]);
    if (new Set(merged).size < 3) return;
    faces.push(merged);
    uvs.push(merged.length === loop.length ? (mesh.uvs[index] ?? null) : null);
  });
  return { ...mesh, points, faces, uvs };
}

/**
 * Splits every face of a mesh into triangles.
 *
 * @param mesh Mesh.
 * @returns Mesh.
 */
export function solidScriptGeometryTriangulate(mesh: SolidScriptShapeMesh): SolidScriptShapeMesh {
  const faces: number[][] = [];
  const uvs: SolidScriptShapeMesh['uvs'] = [];
  mesh.faces.forEach((loop, index) => {
    const uv = mesh.uvs[index] ?? null;
    for (let corner = 1; corner + 1 < loop.length; corner++) {
      faces.push([loop[0]!, loop[corner]!, loop[corner + 1]!]);
      uvs.push(uv ? [uv[0]!, uv[corner]!, uv[corner + 1]!] : null);
    }
  });
  return { ...mesh, faces, uvs };
}

/**
 * Returns whether a shape leaf can have faces.
 *
 * @param leaf Leaf.
 * @returns True for solids and meshes.
 */
export function solidScriptGeometryHasFaces(leaf: SolidScriptShapeLeaf): leaf is SolidScriptGeometryLeaf {
  return leaf.kind !== 'polygon';
}

/**
 * Keeps the faces that show: drops a face that lies back to back against a face
 * of another solid or mesh in the list, such as where the brushes of a Rotate
 * Extrude ring meet. A face counts as covered when the other face holds its
 * center.
 *
 * @param faces Faces.
 * @returns The faces not covered by another one in the list.
 */
export function solidScriptGeometryFacesOutside(faces: readonly SolidScriptFaceFacts[]): SolidScriptFaceFacts[] {
  return faces.filter(
    (face) => !faces.some((other) => other.leaf !== face.leaf && solidScriptGeometryFaceCovers(other, face)),
  );
}

/**
 * Tells whether a face lies on the same plane as another, facing the other way,
 * with the other's center inside it.
 *
 * @param cover Face that may cover.
 * @param face Face that may be covered.
 * @returns True when cover is back to back with face over its center.
 */
function solidScriptGeometryFaceCovers(cover: SolidScriptFaceFacts, face: SolidScriptFaceFacts): boolean {
  if (cover.normal.dot(face.normal) > -1 + SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  const offset = new THREE.Vector3().subVectors(face.center, cover.center);
  if (Math.abs(offset.dot(cover.normal)) > SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  const edge = new THREE.Vector3();
  const toCenter = new THREE.Vector3();
  let sign = 0;
  for (let index = 0; index < cover.corners.length; index++) {
    const start = cover.corners[index]!;
    const end = cover.corners[(index + 1) % cover.corners.length]!;
    const side = edge.subVectors(end, start).cross(toCenter.subVectors(face.center, start)).dot(cover.normal);
    if (Math.abs(side) <= SOLID_SCRIPT_GEOMETRY_EPSILON) continue;
    if (sign !== 0 && Math.sign(side) !== sign) return false;
    sign = Math.sign(side);
  }
  return true;
}
