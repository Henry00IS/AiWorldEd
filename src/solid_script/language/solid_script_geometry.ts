import * as THREE from 'three';
import {
  solidScriptMeshChecked,
  solidScriptMeshFromSolid,
  solidScriptMeshLoopCentre,
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
const SOLID_SCRIPT_GEOMETRY_EPSILON = 1e-5;

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
  middle: THREE.Vector3;
  length: number;
  /** Unit direction from start to end. */
  direction: THREE.Vector3;
  /** The faces that meet at it: the first, and the second when there is one. */
  faces: [SolidScriptFaceFacts, SolidScriptFaceFacts | null];
}

/**
 * Returns the solids and meshes of shapes: the kept shapes of each Union and
 * the first shape of each Difference; flat outlines have no faces.
 *
 * @param shapes Shapes.
 * @returns Leaves.
 */
export function solidScriptGeometryLeaves(shapes: readonly SolidScriptShape[]): SolidScriptGeometryLeaf[] {
  return shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .filter((leaf): leaf is SolidScriptGeometryLeaf => leaf.kind !== 'polygon');
}

/**
 * Returns the faces of a solid or mesh as loops of points.
 *
 * @param leaf Solid or mesh.
 * @returns Mesh with the same faces.
 */
export function solidScriptGeometryMesh(leaf: SolidScriptGeometryLeaf): SolidScriptShapeMesh {
  return leaf.kind === 'mesh' ? leaf : solidScriptMeshFromSolid(leaf.points, leaf.label);
}

/**
 * Works out the two directions along a face: across is level with the ground
 * when the face is not flat on it, up runs up the face.
 *
 * @param normal Unit face direction.
 * @returns Across and up.
 */
export function solidScriptGeometryFrame(normal: THREE.Vector3): { across: THREE.Vector3; up: THREE.Vector3 } {
  const world = Math.abs(normal.z) > 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const across = new THREE.Vector3().crossVectors(world, normal).normalize();
  if (normal.z > 0.999) across.set(1, 0, 0);
  if (normal.z < -0.999) across.set(-1, 0, 0);
  const up = new THREE.Vector3().crossVectors(normal, across).normalize();
  return { across, up };
}

/**
 * Returns the matrix that puts a shape on a face: its origin at the face
 * centre, X across, Y up the face and Z out of it.
 *
 * @param face Face.
 * @returns Matrix.
 */
export function solidScriptGeometryFaceMatrix(face: SolidScriptFaceFacts): THREE.Matrix4 {
  return new THREE.Matrix4().makeBasis(face.across, face.up, face.normal).setPosition(face.center);
}

/**
 * Names a face from the way it points and what built it.
 *
 * @param normal Unit face direction.
 * @param role What built the shape, such as "stairs +x".
 * @returns Names, plainest first.
 */
export function solidScriptGeometryTags(normal: THREE.Vector3, role: string | undefined): string[] {
  const level =
    normal.z > SOLID_SCRIPT_GEOMETRY_LEVEL ? 'Top' : normal.z < -SOLID_SCRIPT_GEOMETRY_LEVEL ? 'Bottom' : 'Side';
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

/** Direction each Stairs Ascend value climbs, in script space (Z up). */
const SOLID_SCRIPT_GEOMETRY_CLIMB: Readonly<Record<string, THREE.Vector3>> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+z': new THREE.Vector3(0, 1, 0),
  '-z': new THREE.Vector3(0, -1, 0),
};

/**
 * Reads every face of shapes, numbered from 0 in build order.
 *
 * @param shapes Shapes.
 * @returns Faces.
 */
export function solidScriptGeometryFaces(shapes: readonly SolidScriptShape[]): SolidScriptFaceFacts[] {
  const faces: SolidScriptFaceFacts[] = [];
  for (const leaf of solidScriptGeometryLeaves(shapes)) {
    const mesh = solidScriptGeometryMesh(leaf);
    for (const loop of mesh.faces) faces.push(solidScriptGeometryFace(mesh.points, loop, leaf, faces.length));
  }
  return faces;
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
  const center = solidScriptMeshLoopCentre(points, loop);
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
    tags: solidScriptGeometryTags(normal, role),
  };
}

/**
 * Reads every corner point of shapes, each once per solid or mesh.
 *
 * @param shapes Shapes.
 * @returns Points.
 */
export function solidScriptGeometryVertices(shapes: readonly SolidScriptShape[]): SolidScriptVertexFacts[] {
  const vertices: SolidScriptVertexFacts[] = [];
  for (const leaf of solidScriptGeometryLeaves(shapes)) {
    const mesh = solidScriptGeometryMesh(leaf);
    const normals = mesh.points.map(() => new THREE.Vector3());
    for (const loop of mesh.faces) {
      const normal = solidScriptMeshLoopNormal(mesh.points, loop);
      for (const corner of loop) normals[corner]!.add(normal);
    }
    mesh.points.forEach((position, corner) =>
      vertices.push({ index: vertices.length, position: position.clone(), normal: normals[corner]!.normalize() }),
    );
  }
  return vertices;
}

/**
 * Reads every edge of shapes, each once, with the faces that meet there.
 *
 * @param shapes Shapes.
 * @returns Edges.
 */
export function solidScriptGeometryEdges(shapes: readonly SolidScriptShape[]): SolidScriptEdgeFacts[] {
  const edges: SolidScriptEdgeFacts[] = [];
  let faceIndex = 0;
  for (const leaf of solidScriptGeometryLeaves(shapes)) {
    const mesh = solidScriptGeometryMesh(leaf);
    const found = new Map<string, SolidScriptEdgeFacts>();
    for (const loop of mesh.faces) {
      const face = solidScriptGeometryFace(mesh.points, loop, leaf, faceIndex++);
      loop.forEach((a, corner) => {
        const b = loop[(corner + 1) % loop.length]!;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const known = found.get(key);
        if (known) {
          known.faces[1] = face;
          return;
        }
        const start = mesh.points[a]!.clone();
        const end = mesh.points[b]!.clone();
        const edge: SolidScriptEdgeFacts = {
          index: edges.length,
          start,
          end,
          middle: start.clone().add(end).multiplyScalar(0.5),
          length: start.distanceTo(end),
          direction: end.clone().sub(start).normalize(),
          faces: [face, null],
        };
        found.set(key, edge);
        edges.push(edge);
      });
    }
  }
  return edges;
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
 * Finds a face again in a solid or mesh, by its centre and direction, after
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
      solidScriptMeshLoopCentre(mesh.points, loop).distanceTo(face.center) < 1e-4 &&
      solidScriptMeshLoopNormal(mesh.points, loop).dot(face.normal) > 0.9999,
  );
}

/**
 * Builds the corner points of the block a face sweeps out when it is pulled
 * along its direction: a new convex solid on the face.
 *
 * @param face Face.
 * @param distance Metres, above 0.
 * @returns Points.
 */
export function solidScriptGeometryFacePrism(face: SolidScriptFaceFacts, distance: number): THREE.Vector3[] {
  return [...face.corners, ...face.corners.map((corner) => corner.clone().addScaledVector(face.normal, distance))];
}

/**
 * Cuts a convex solid with a plane and keeps the part behind it.
 *
 * @param points Corner points of the solid.
 * @param normal Unit plane direction; the part it points away from is kept.
 * @param constant Plane offset: points p with normal · p = constant lie on it.
 * @param label Label, for errors.
 * @returns Corner points of the kept part.
 */
export function solidScriptGeometryClip(
  points: readonly THREE.Vector3[],
  normal: THREE.Vector3,
  constant: number,
  label: string,
): THREE.Vector3[] {
  const mesh = solidScriptMeshFromSolid(points, label);
  const side = (point: THREE.Vector3): number => normal.dot(point) - constant;
  const kept = mesh.points
    .filter((point) => side(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON)
    .map((point) => point.clone());
  const seen = new Set<string>();
  for (const loop of mesh.faces)
    loop.forEach((a, corner) => {
      const b = loop[(corner + 1) % loop.length]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      const pa = mesh.points[a]!;
      const pb = mesh.points[b]!;
      const da = side(pa);
      const db = side(pb);
      if (
        (da < -SOLID_SCRIPT_GEOMETRY_EPSILON && db > SOLID_SCRIPT_GEOMETRY_EPSILON) ||
        (db < -SOLID_SCRIPT_GEOMETRY_EPSILON && da > SOLID_SCRIPT_GEOMETRY_EPSILON)
      )
        kept.push(pa.clone().lerp(pb, da / (da - db)));
    });
  return kept;
}

/**
 * Bevels edges of a convex solid: every edge both of whose faces are known is
 * cut off flat, the given distance along each face.
 *
 * @param solid Solid.
 * @param edges Edges to bevel, read from this solid.
 * @param distance Metres along each face.
 * @returns Corner points of the bevelled solid.
 */
export function solidScriptGeometryBevel(
  solid: SolidScriptShapeSolid,
  edges: readonly SolidScriptEdgeFacts[],
  distance: number,
): THREE.Vector3[] {
  let points = solid.points.map((point) => point.clone());
  for (const edge of edges) {
    const [first, second] = edge.faces;
    if (!second || first.normal.dot(second.normal) > 0.999) continue;
    const bisector = first.normal.clone().add(second.normal).normalize();
    const inward = second.normal
      .clone()
      .addScaledVector(first.normal, -first.normal.dot(second.normal))
      .normalize()
      .negate();
    const through = edge.start.clone().addScaledVector(inward, distance);
    points = solidScriptGeometryClip(points, bisector, bisector.dot(through), solid.label);
  }
  return points;
}

/**
 * Insets faces of a mesh: each face gets a smaller copy of itself inside,
 * joined to its old edge by a ring of faces.
 *
 * @param mesh Mesh.
 * @param chosen Face numbers to inset.
 * @param distance Metres from the old edge to the new one.
 * @returns Mesh.
 */
export function solidScriptGeometryInset(
  mesh: SolidScriptShapeMesh,
  chosen: ReadonlySet<number>,
  distance: number,
): SolidScriptShapeMesh {
  const points = mesh.points.map((point) => point.clone());
  const faces: number[][] = [];
  const uvs: SolidScriptShapeMesh['uvs'] = [];
  mesh.faces.forEach((loop, faceIndex) => {
    if (!chosen.has(faceIndex)) {
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

/** One point For Each Scattered Point gives, on its face. */
export interface SolidScriptScatterPoint {
  position: THREE.Vector3;
  face: SolidScriptFaceFacts;
}

/**
 * Spreads points at random over faces, evenly by area: each point picks a
 * triangle of the faces by its share of the area, then a spot inside it. The
 * same seed always gives the same points.
 *
 * @param faces Faces, each convex with its corners in order.
 * @param count How many points.
 * @param seed Seed.
 * @returns Points in order.
 */
export function solidScriptGeometryScatter(
  faces: readonly SolidScriptFaceFacts[],
  count: number,
  seed: number,
): SolidScriptScatterPoint[] {
  const triangles: { face: SolidScriptFaceFacts; a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }[] = [];
  const reach: number[] = [];
  let total = 0;
  const edge = new THREE.Vector3();
  const other = new THREE.Vector3();
  for (const face of faces)
    for (let corner = 1; corner + 1 < face.corners.length; corner++) {
      const [a, b, c] = [face.corners[0]!, face.corners[corner]!, face.corners[corner + 1]!];
      const area = edge.subVectors(b, a).cross(other.subVectors(c, a)).length() / 2;
      if (area <= 1e-12) continue;
      total += area;
      triangles.push({ face, a, b, c });
      reach.push(total);
    }
  if (triangles.length === 0) return [];
  let state = (Math.floor(seed * 1000) ^ 0x6d2b79f5) >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const points: SolidScriptScatterPoint[] = [];
  for (let index = 0; index < count; index++) {
    const target = random() * total;
    let low = 0;
    let high = reach.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (reach[middle]! < target) low = middle + 1;
      else high = middle;
    }
    const { face, a, b, c } = triangles[low]!;
    const root = Math.sqrt(random());
    const along = random();
    const position = new THREE.Vector3()
      .addScaledVector(a, 1 - root)
      .addScaledVector(b, root * (1 - along))
      .addScaledVector(c, root * along);
    points.push({ position, face });
  }
  return points;
}
