import * as THREE from 'three';
import type { SolidScriptFaceTag, SolidScriptShape } from './solid_script_shape.js';
import { solidScriptMeshLimitCheck } from './solid_script_limits.js';

/** Texture coordinate of one face corner. */
export type SolidScriptUv = [number, number];

/**
 * A polygon mesh a script builds: shared corner points, faces as loops of point
 * numbers (counter-clockwise seen from outside), and optional texture
 * coordinates per face corner. Unlike solids it may be open, dented or
 * non-convex, and becomes a regular mesh object instead of brushes.
 */
export interface SolidScriptShapeMesh {
  kind: 'mesh';
  label: string;
  points: THREE.Vector3[];
  faces: number[][];
  /**
   * Corner coordinates per face, in the face's corner order, or null for
   * automatic ones.
   */
  uvs: (SolidScriptUv[] | null)[];
  /**
   * Library texture of the whole mesh, from a Texture block; none keeps the
   * default.
   */
  texture?: string;
  /** Tags the operations that built faces gave them, such as Inner. */
  faceTags?: SolidScriptFaceTag[];
  /**
   * Accumulated pose of the mesh since its UVs were written. Transform UVs
   * World Aligned uses it to project from the current script-space position,
   * then drops it.
   */
  uvCarry?: THREE.Matrix4;
}

/** Most corner points a mesh may have after an operation. */
export { SOLID_SCRIPT_MESH_POINTS_MAX } from './solid_script_limits.js';

/** Told when a tool would turn a brush into a mesh. */
export const SOLID_SCRIPT_MESH_NEEDS_WRAP =
  'This would no longer be a convex solid. Wrap it in Mesh From Solids first.';

/**
 * Checks a mesh's size and its faces' point numbers.
 *
 * @param mesh Mesh.
 * @returns The mesh.
 */
export function solidScriptMeshChecked(mesh: SolidScriptShapeMesh): SolidScriptShapeMesh {
  solidScriptMeshLimitCheck(mesh.points.length, mesh.faces);
  if (mesh.faces.length === 0) throw new Error('a mesh needs at least one Face line');
  mesh.faces.forEach((face, index) => {
    if (face.length < 3) throw new Error(`face ${index} has ${face.length} corners; a face needs at least 3`);
    for (const corner of face)
      if (!Number.isInteger(corner) || corner < 0 || corner >= mesh.points.length)
        throw new Error(
          `face ${index} uses point ${corner}, but the mesh has points 0 to ${mesh.points.length - 1}; Vertex lines count from 0`,
        );
    if (new Set(face).size !== face.length) throw new Error(`face ${index} uses the same point twice`);
  });
  return mesh;
}

/**
 * Joins meshes into one, keeping every face. A mesh holds one texture, so the
 * result takes the first texture any of them has.
 *
 * @param meshes Meshes.
 * @param label Label of the result.
 * @returns Mesh.
 */
export function solidScriptMeshJoin(meshes: readonly SolidScriptShapeMesh[], label: string): SolidScriptShapeMesh {
  const joined: SolidScriptShapeMesh = { kind: 'mesh', label, points: [], faces: [], uvs: [] };
  for (const mesh of meshes) {
    const base = joined.points.length;
    joined.points.push(...mesh.points.map((point) => point.clone()));
    joined.faces.push(...mesh.faces.map((face) => face.map((corner) => corner + base)));
    joined.uvs.push(...mesh.uvs.map((uv) => (uv ? uv.map(([u, v]): SolidScriptUv => [u, v]) : null)));
    if (joined.texture === undefined && mesh.texture !== undefined) joined.texture = mesh.texture;
  }
  return joined;
}

/**
 * Moves a mesh by a matrix; a mirroring matrix flips the faces so they still
 * face outwards.
 *
 * @param mesh Mesh.
 * @param matrix Matrix.
 * @returns Moved mesh.
 */
export function solidScriptMeshTransform(mesh: SolidScriptShapeMesh, matrix: THREE.Matrix4): SolidScriptShapeMesh {
  const flip = matrix.determinant() < 0;
  const moved: SolidScriptShapeMesh = {
    ...mesh,
    points: mesh.points.map((point) => point.clone().applyMatrix4(matrix)),
    faces: flip ? mesh.faces.map((face) => [...face].reverse()) : mesh.faces.map((face) => [...face]),
    uvs: flip ? mesh.uvs.map((uv) => (uv ? [...uv].reverse() : null)) : mesh.uvs,
    ...(mesh.faceTags ? { faceTags: solidScriptFaceTagsTransform(mesh.faceTags, matrix) } : {}),
  };
  const uvCarry = solidScriptMeshUvCarry(mesh, matrix);
  if (uvCarry) moved.uvCarry = uvCarry;
  else delete moved.uvCarry;
  return moved;
}

/**
 * Accumulated mesh pose after this transform, so World Aligned can project from
 * the current position. Vertex UVs travel with the points, so the whole matrix
 * is stored.
 *
 * @param mesh Mesh before the transform.
 * @param matrix Transform applied to its points.
 * @returns Pose, or none when it is still the identity.
 */
function solidScriptMeshUvCarry(mesh: SolidScriptShapeMesh, matrix: THREE.Matrix4): THREE.Matrix4 | undefined {
  const pose = mesh.uvCarry ? matrix.clone().multiply(mesh.uvCarry) : matrix.clone();
  return pose.equals(new THREE.Matrix4()) ? undefined : pose;
}

/**
 * Moves face tags with their shape.
 *
 * @param tags Face tags.
 * @param matrix Transform.
 * @returns Moved tags.
 */
export function solidScriptFaceTagsTransform(
  tags: readonly SolidScriptFaceTag[],
  matrix: THREE.Matrix4,
): SolidScriptFaceTag[] {
  const normals = new THREE.Matrix3().getNormalMatrix(matrix);
  return tags.map((face) => ({
    ...face,
    point: face.point.clone().applyMatrix4(matrix),
    normal: face.normal.clone().applyMatrix3(normals).normalize(),
  }));
}

/**
 * Newell normal of a loop of points.
 *
 * @param points Mesh points.
 * @param loop Point numbers.
 * @returns Unit normal, or zero for a degenerate loop.
 */
export function solidScriptMeshLoopNormal(points: readonly THREE.Vector3[], loop: readonly number[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  loop.forEach((index, corner) => {
    const a = points[index]!;
    const b = points[loop[(corner + 1) % loop.length]!]!;
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  });
  return normal.lengthSq() > 0 ? normal.normalize() : normal;
}

/**
 * Average of a loop's points.
 *
 * @param points Mesh points.
 * @param loop Point numbers.
 * @returns Center.
 */
export function solidScriptMeshLoopCenter(points: readonly THREE.Vector3[], loop: readonly number[]): THREE.Vector3 {
  return loop.reduce((sum, index) => sum.add(points[index]!), new THREE.Vector3()).divideScalar(loop.length);
}

/**
 * Smooth normal of every point: the area-weighted average of its faces'
 * normals.
 *
 * @param mesh Mesh.
 * @returns Unit normals per point.
 */
export function solidScriptMeshPointNormals(mesh: SolidScriptShapeMesh): THREE.Vector3[] {
  const normals = mesh.points.map(() => new THREE.Vector3());
  for (const face of mesh.faces) {
    const area = solidScriptMeshLoopArea(mesh.points, face);
    for (const index of face) normals[index]!.add(area);
  }
  return normals.map((normal) => (normal.lengthSq() > 0 ? normal.normalize() : normal));
}

/**
 * Twice the area of a loop of points, pointing along its normal, from a fan of
 * triangles around its first point.
 *
 * @param points Mesh points.
 * @param loop Point numbers.
 * @returns Area vector, twice the area long.
 */
export function solidScriptMeshLoopArea(points: readonly THREE.Vector3[], loop: readonly number[]): THREE.Vector3 {
  const first = points[loop[0]!]!;
  const area = new THREE.Vector3();
  for (let corner = 1; corner + 1 < loop.length; corner++) {
    const b = points[loop[corner]!]!.clone().sub(first);
    const c = points[loop[corner + 1]!]!.clone().sub(first);
    area.add(b.cross(c));
  }
  return area;
}

/**
 * Key of an undirected edge, one number for both directions.
 *
 * @param a Point number.
 * @param b Point number.
 * @param count Number of points in the mesh.
 * @returns Key.
 */
function solidScriptMeshEdgeKey(a: number, b: number, count: number): number {
  return a < b ? a * count + b : b * count + a;
}

/**
 * Point numbers of an undirected edge key, lower first.
 *
 * @param key Edge key.
 * @param count Number of points in the mesh the key was made for.
 * @returns Both point numbers.
 */
function solidScriptMeshEdgeEnds(key: number, count: number): [number, number] {
  return [Math.floor(key / count), key % count];
}

/**
 * Subdivides every face once: a point in the middle of each face and each edge,
 * and one quad per face corner. Smooth moves the points like Catmull-Clark
 * subdivision, rounding the mesh; without it the shape stays exactly as it was,
 * only with more faces.
 *
 * @param mesh Mesh.
 * @param smooth True to round the mesh.
 * @returns Subdivided mesh.
 */
export function solidScriptMeshSubdivide(mesh: SolidScriptShapeMesh, smooth: boolean): SolidScriptShapeMesh {
  const points = mesh.points;
  const facePoints = mesh.faces.map((face) => solidScriptMeshLoopCenter(points, face));
  const count = points.length;
  const edgeFaces = new Map<number, number[]>();
  mesh.faces.forEach((face, faceIndex) =>
    face.forEach((a, corner) => {
      const key = solidScriptMeshEdgeKey(a, face[(corner + 1) % face.length]!, count);
      const list = edgeFaces.get(key) ?? [];
      list.push(faceIndex);
      edgeFaces.set(key, list);
    }),
  );
  const edgeIndex = new Map<number, number>();
  const edgePoints: THREE.Vector3[] = [];
  for (const [key, faces] of edgeFaces) {
    const [a, b] = solidScriptMeshEdgeEnds(key, count);
    const middle = points[a]!.clone().add(points[b]!).multiplyScalar(0.5);
    if (smooth && faces.length === 2)
      middle.multiplyScalar(2).add(facePoints[faces[0]!]!).add(facePoints[faces[1]!]!).multiplyScalar(0.25);
    edgeIndex.set(key, edgePoints.length);
    edgePoints.push(middle);
  }
  const moved = smooth
    ? solidScriptMeshCatmullPoints(mesh, facePoints, edgeFaces)
    : points.map((point) => point.clone());
  const edgeBase = moved.length;
  const faceBase = edgeBase + edgePoints.length;
  const faces: number[][] = [];
  const uvs: (SolidScriptUv[] | null)[] = [];
  mesh.faces.forEach((face, faceIndex) => {
    const uv = mesh.uvs[faceIndex];
    const uvCenter = uv ? solidScriptUvAverage(uv) : null;
    face.forEach((point, corner) => {
      const next = face[(corner + 1) % face.length]!;
      const previous = face[(corner + face.length - 1) % face.length]!;
      faces.push([
        point,
        edgeBase + edgeIndex.get(solidScriptMeshEdgeKey(point, next, count))!,
        faceBase + faceIndex,
        edgeBase + edgeIndex.get(solidScriptMeshEdgeKey(previous, point, count))!,
      ]);
      if (!uv || !uvCenter) {
        uvs.push(null);
        return;
      }
      const here = uv[corner]!;
      const after = uv[(corner + 1) % face.length]!;
      const before = uv[(corner + face.length - 1) % face.length]!;
      uvs.push([here, solidScriptUvAverage([here, after]), uvCenter, solidScriptUvAverage([before, here])]);
    });
  });
  return solidScriptMeshChecked({ ...mesh, points: [...moved, ...edgePoints, ...facePoints], faces, uvs });
}

/**
 * Catmull-Clark positions of the original points. Border points follow their
 * border edges only, so open meshes keep their outline.
 *
 * @param mesh Mesh.
 * @param facePoints Face centers.
 * @param edgeFaces Faces of every edge.
 * @returns Moved points.
 */
function solidScriptMeshCatmullPoints(
  mesh: SolidScriptShapeMesh,
  facePoints: readonly THREE.Vector3[],
  edgeFaces: ReadonlyMap<number, number[]>,
): THREE.Vector3[] {
  const pointFaces = mesh.points.map((): number[] => []);
  mesh.faces.forEach((face, faceIndex) => face.forEach((point) => pointFaces[point]!.push(faceIndex)));
  const pointEdges = mesh.points.map((): [number, boolean][] => []);
  for (const [key, faces] of edgeFaces) {
    const [a, b] = solidScriptMeshEdgeEnds(key, mesh.points.length);
    pointEdges[a]!.push([b, faces.length < 2]);
    pointEdges[b]!.push([a, faces.length < 2]);
  }
  return mesh.points.map((point, index) => {
    const edges = pointEdges[index]!;
    const border = edges.filter(([, open]) => open);
    if (border.length >= 2) {
      const sum = border.reduce((total, [other]) => total.add(mesh.points[other]!), new THREE.Vector3());
      return point
        .clone()
        .multiplyScalar(6)
        .add(sum)
        .divideScalar(6 + border.length);
    }
    const count = pointFaces[index]!.length;
    if (count === 0 || edges.length === 0) return point.clone();
    const faceAverage = pointFaces[index]!.reduce(
      (sum, face) => sum.add(facePoints[face]!),
      new THREE.Vector3(),
    ).divideScalar(count);
    const edgeAverage = edges
      .reduce(
        (sum, [other]) => sum.add(point.clone().add(mesh.points[other]!).multiplyScalar(0.5)),
        new THREE.Vector3(),
      )
      .divideScalar(edges.length);
    const valence = edges.length;
    return faceAverage
      .add(edgeAverage.multiplyScalar(2))
      .add(point.clone().multiplyScalar(valence - 3))
      .divideScalar(valence);
  });
}

/**
 * Average of texture coordinates.
 *
 * @param uvs Coordinates.
 * @returns Average.
 */
function solidScriptUvAverage(uvs: readonly SolidScriptUv[]): SolidScriptUv {
  const [u, v] = uvs.reduce(([su, sv], [a, b]) => [su + a, sv + b], [0, 0]);
  return [u / uvs.length, v / uvs.length];
}

/**
 * Relaxes the mesh: moves every point part of the way to the average of its
 * neighbours, a number of times. Border points of open meshes stay put.
 *
 * @param mesh Mesh.
 * @param iterations Rounds.
 * @param strength Share of the way to move each round, 0 to 1.
 * @returns Smoothed mesh.
 */
export function solidScriptMeshSmooth(
  mesh: SolidScriptShapeMesh,
  iterations: number,
  strength: number,
): SolidScriptShapeMesh {
  const neighbours = mesh.points.map(() => new Set<number>());
  const count = mesh.points.length;
  const edgeUse = new Map<number, number>();
  for (const face of mesh.faces)
    face.forEach((a, corner) => {
      const b = face[(corner + 1) % face.length]!;
      neighbours[a]!.add(b);
      neighbours[b]!.add(a);
      const key = solidScriptMeshEdgeKey(a, b, count);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    });
  const fixed = new Set<number>();
  for (const [key, uses] of edgeUse)
    if (uses < 2) for (const index of solidScriptMeshEdgeEnds(key, count)) fixed.add(index);
  let points = mesh.points.map((point) => point.clone());
  for (let round = 0; round < iterations; round++)
    points = points.map((point, index) => {
      const around = neighbours[index]!;
      if (fixed.has(index) || around.size === 0) return point.clone();
      const average = [...around]
        .reduce((sum, other) => sum.add(points[other]!), new THREE.Vector3())
        .divideScalar(around.size);
      return point.clone().lerp(average, strength);
    });
  return { ...mesh, points };
}

/**
 * Pulls chosen faces out along their normals, each on its own, with side faces
 * joining them to the rest of the mesh. A negative distance pushes the face in,
 * making a dent with walls facing into it.
 *
 * @param mesh Mesh.
 * @param distance Distance per face, or null to leave the face alone; gets the
 *   face center, normal and number.
 * @returns Extruded mesh.
 */
export function solidScriptMeshExtrudeFaces(
  mesh: SolidScriptShapeMesh,
  distance: (center: THREE.Vector3, normal: THREE.Vector3, index: number) => number | null,
): SolidScriptShapeMesh {
  const points = mesh.points.map((point) => point.clone());
  const faces: number[][] = [];
  const uvs: (SolidScriptUv[] | null)[] = [];
  mesh.faces.forEach((face, faceIndex) => {
    const normal = solidScriptMeshLoopNormal(mesh.points, face);
    const amount = distance(solidScriptMeshLoopCenter(mesh.points, face), normal, faceIndex);
    if (amount === null || amount === 0) {
      faces.push([...face]);
      uvs.push(mesh.uvs[faceIndex] ?? null);
      return;
    }
    const top = face.map((index) => points.push(mesh.points[index]!.clone().addScaledVector(normal, amount)) - 1);
    face.forEach((a, corner) => {
      const next = (corner + 1) % face.length;
      faces.push([a, face[next]!, top[next]!, top[corner]!]);
      uvs.push(null);
    });
    faces.push(top);
    uvs.push(mesh.uvs[faceIndex] ?? null);
  });
  return solidScriptMeshChecked({ ...mesh, points, faces, uvs });
}

/**
 * Returns whether a shape tree holds a mesh.
 *
 * @param shape Shape tree.
 * @returns True when any leaf is a mesh.
 */
export function solidScriptShapeHasMesh(shape: SolidScriptShape): boolean {
  const nested = shape.kind === 'boolean' || shape.kind === 'group' ? shape.children : undefined;
  return shape.kind === 'mesh' || (nested !== undefined && nested.some(solidScriptShapeHasMesh));
}

/**
 * Lists the meshes a script built: at the top or inside unions (cuts never hold
 * meshes).
 *
 * @param shapes Shapes.
 * @returns Meshes.
 */
export function solidScriptShapeMeshes(shapes: readonly SolidScriptShape[]): SolidScriptShapeMesh[] {
  return shapes.flatMap((shape) =>
    shape.kind === 'mesh'
      ? [shape]
      : shape.kind === 'boolean' || shape.kind === 'group'
        ? solidScriptShapeMeshes(shape.children)
        : [],
  );
}

/**
 * Welds corners closer than a distance into one, at their first corner, and
 * drops the faces that fold to fewer than three corners. Nearby corners are
 * found through a grid of cells one distance wide.
 *
 * @param mesh Mesh.
 * @param distance Largest gap that is welded, in metres.
 * @returns Mesh with fewer corners.
 */
export function solidScriptMeshMerge(mesh: SolidScriptShapeMesh, distance: number): SolidScriptShapeMesh {
  const cell = Math.max(distance, 1e-9);
  const cells = new Map<string, number[]>();
  const kept: THREE.Vector3[] = [];
  const target = mesh.points.map((point) => {
    const [x, y, z] = [point.x, point.y, point.z].map((value) => Math.floor(value / cell));
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const index of cells.get(`${x! + dx},${y! + dy},${z! + dz}`) ?? [])
            if (kept[index]!.distanceTo(point) <= distance) return index;
    const key = `${x},${y},${z}`;
    cells.set(key, [...(cells.get(key) ?? []), kept.length]);
    kept.push(point.clone());
    return kept.length - 1;
  });
  const faces: number[][] = [];
  const uvs: (SolidScriptUv[] | null)[] = [];
  mesh.faces.forEach((face, at) => {
    const uv = mesh.uvs[at] ?? null;
    const corners: number[] = [];
    const cornerUvs: SolidScriptUv[] = [];
    face.forEach((corner, index) => {
      const welded = target[corner]!;
      if (corners[corners.length - 1] === welded) return;
      corners.push(welded);
      if (uv?.[index]) cornerUvs.push(uv[index]);
    });
    if (corners.length > 1 && corners[0] === corners[corners.length - 1]) {
      corners.pop();
      if (uv) cornerUvs.pop();
    }
    if (new Set(corners).size < 3) return;
    faces.push(corners);
    uvs.push(uv ? cornerUvs : null);
  });
  return { ...mesh, points: kept, faces, uvs };
}
