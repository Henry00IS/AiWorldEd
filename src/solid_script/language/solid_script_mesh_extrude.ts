import * as THREE from 'three';
import { solidScriptMeshEdgeKey } from './solid_script_mesh_edge_split.js';
import { solidScriptMeshFaceTagNames } from './solid_script_mesh_face_split.js';
import {
  solidScriptMeshChecked,
  solidScriptMeshLoopCenter,
  solidScriptMeshLoopNormal,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from './solid_script_mesh.js';
import type { SolidScriptFaceTag } from './solid_script_shape.js';

/** How far and which way one face is pulled. */
export interface SolidScriptMeshExtrudePick {
  /** Metres; negative pushes in. */
  distance: number;
  /** Unit direction it moves along. */
  direction: THREE.Vector3;
}

/** A mesh after Extrude Face, with the numbers of the faces it made. */
export interface SolidScriptMeshExtruded {
  mesh: SolidScriptShapeMesh;
  /**
   * The moved face of each picked face, in the order of the picked face
   * numbers.
   */
  tops: number[];
  /** The new side faces. */
  sides: number[];
}

/** A mesh being built: its points, faces and corner UVs. */
interface SolidScriptMeshExtrudeBuild {
  points: THREE.Vector3[];
  faces: number[][];
  uvs: (SolidScriptUv[] | null)[];
}

/**
 * Starts a build from a mesh's own points and faces.
 *
 * @param mesh Mesh.
 * @returns Build.
 */
function solidScriptMeshExtrudeStart(mesh: SolidScriptShapeMesh): SolidScriptMeshExtrudeBuild {
  return {
    points: mesh.points.map((point) => point.clone()),
    faces: mesh.faces.map((loop) => [...loop]),
    uvs: mesh.uvs.map((uv) => uv),
  };
}

/**
 * Adds a side face from an edge of a picked face to its moved copy.
 *
 * @param build Build.
 * @param a First corner.
 * @param b Second corner, after a in the face loop.
 * @param top Moved corner per corner.
 * @returns Number of the side face.
 */
function solidScriptMeshExtrudeSide(
  build: SolidScriptMeshExtrudeBuild,
  a: number,
  b: number,
  top: (corner: number) => number,
): number {
  build.uvs.push(null);
  return build.faces.push([a, b, top(b), top(a)]) - 1;
}

/**
 * Finishes a build: tags each moved face like the face it came from.
 *
 * @param mesh Mesh before.
 * @param build Build.
 * @param tops Moved faces, in the order of the picked face numbers.
 * @param sides Side faces.
 * @returns Result.
 */
function solidScriptMeshExtrudeFinish(
  mesh: SolidScriptShapeMesh,
  build: SolidScriptMeshExtrudeBuild,
  tops: number[],
  sides: number[],
): SolidScriptMeshExtruded {
  const tags: SolidScriptFaceTag[] = [...(mesh.faceTags ?? [])];
  for (const face of tops) {
    const loop = build.faces[face] ?? [];
    const point = solidScriptMeshLoopCenter(build.points, loop);
    const normal = solidScriptMeshLoopNormal(build.points, loop);
    for (const tag of solidScriptMeshFaceTagNames(mesh, face)) tags.push({ point, normal, tag });
  }
  const made = { ...mesh, ...build, ...(tags.length > 0 ? { faceTags: tags } : {}) };
  return { mesh: solidScriptMeshChecked(made), tops, sides };
}

/**
 * Pulls each picked face out on its own: it gets its own moved corners and a
 * ring of side faces, so neighbouring picked faces separate.
 *
 * @param mesh Mesh.
 * @param picks Distance and direction per picked face number.
 * @returns Mesh and the faces made.
 */
export function solidScriptMeshExtrudeIndividual(
  mesh: SolidScriptShapeMesh,
  picks: ReadonlyMap<number, SolidScriptMeshExtrudePick>,
): SolidScriptMeshExtruded {
  const build = solidScriptMeshExtrudeStart(mesh);
  const tops: number[] = [];
  const sides: number[] = [];
  for (const face of [...picks.keys()].sort((a, b) => a - b)) {
    const pick = picks.get(face);
    const loop = mesh.faces[face] ?? [];
    tops.push(face);
    if (!pick || pick.distance === 0) continue;
    const moved = new Map(
      loop.map((corner) => {
        const at = (mesh.points[corner] ?? new THREE.Vector3()).clone().addScaledVector(pick.direction, pick.distance);
        return [corner, build.points.push(at) - 1];
      }),
    );
    const top = (corner: number) => moved.get(corner) ?? corner;
    loop.forEach((a, slot) =>
      sides.push(solidScriptMeshExtrudeSide(build, a, loop[(slot + 1) % loop.length] ?? a, top)),
    );
    build.faces[face] = loop.map(top);
  }
  return solidScriptMeshExtrudeFinish(
    mesh,
    build,
    [...picks.keys()].sort((a, b) => a - b),
    sides,
  );
}

/**
 * Works out how far each corner of a region moves: the average of the moves of
 * the picked faces around it.
 *
 * @param mesh Mesh.
 * @param picks Distance and direction per picked face number.
 * @returns Move per corner.
 */
function solidScriptMeshExtrudeRegionMoves(
  mesh: SolidScriptShapeMesh,
  picks: ReadonlyMap<number, SolidScriptMeshExtrudePick>,
): Map<number, THREE.Vector3> {
  const sums = new Map<number, { move: THREE.Vector3; count: number }>();
  for (const [face, pick] of picks)
    for (const corner of mesh.faces[face] ?? []) {
      const sum = sums.get(corner) ?? { move: new THREE.Vector3(), count: 0 };
      sum.move.addScaledVector(pick.direction, pick.distance);
      sum.count++;
      sums.set(corner, sum);
    }
  return new Map([...sums].map(([corner, sum]) => [corner, sum.move.divideScalar(sum.count)]));
}

/**
 * Counts how many picked faces use each edge, so the region's border can be
 * told from its inside.
 *
 * @param mesh Mesh.
 * @param picks Picked face numbers.
 * @returns Picked faces per edge key.
 */
function solidScriptMeshExtrudeRegionEdgeUse(mesh: SolidScriptShapeMesh, picks: Iterable<number>): Map<string, number> {
  const use = new Map<string, number>();
  for (const face of picks) {
    const loop = mesh.faces[face] ?? [];
    loop.forEach((a, slot) => {
      const key = solidScriptMeshEdgeKey(a, loop[(slot + 1) % loop.length] ?? a);
      use.set(key, (use.get(key) ?? 0) + 1);
    });
  }
  return use;
}

/**
 * Pulls connected picked faces out together as one region: corners they share
 * move once, by the average of their faces' moves, and side faces are built
 * only along the region's border.
 *
 * @param mesh Mesh.
 * @param picks Distance and direction per picked face number.
 * @returns Mesh and the faces made.
 */
export function solidScriptMeshExtrudeRegion(
  mesh: SolidScriptShapeMesh,
  picks: ReadonlyMap<number, SolidScriptMeshExtrudePick>,
): SolidScriptMeshExtruded {
  const build = solidScriptMeshExtrudeStart(mesh);
  const moving = new Map([...picks].filter(([, pick]) => pick.distance !== 0));
  const moves = solidScriptMeshExtrudeRegionMoves(mesh, moving);
  const moved = new Map(
    [...moves].map(([corner, move]) => [
      corner,
      build.points.push((mesh.points[corner] ?? move).clone().add(move)) - 1,
    ]),
  );
  const top = (corner: number) => moved.get(corner) ?? corner;
  const use = solidScriptMeshExtrudeRegionEdgeUse(mesh, moving.keys());
  const sides: number[] = [];
  for (const face of [...moving.keys()].sort((a, b) => a - b)) {
    const loop = mesh.faces[face] ?? [];
    loop.forEach((a, slot) => {
      const b = loop[(slot + 1) % loop.length] ?? a;
      if ((use.get(solidScriptMeshEdgeKey(a, b)) ?? 0) < 2) sides.push(solidScriptMeshExtrudeSide(build, a, b, top));
    });
    build.faces[face] = loop.map(top);
  }
  return solidScriptMeshExtrudeFinish(
    mesh,
    build,
    [...picks.keys()].sort((a, b) => a - b),
    sides,
  );
}
