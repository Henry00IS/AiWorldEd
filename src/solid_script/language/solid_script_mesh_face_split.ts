import { solidScriptGeometryFaceHolds } from './solid_script_geometry.js';
import {
  solidScriptMeshLoopCenter,
  solidScriptMeshLoopNormal,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from './solid_script_mesh.js';
import type { SolidScriptFaceTag } from './solid_script_shape.js';

/** Face normals at least this aligned face the same way. */
const SOLID_SCRIPT_MESH_FACE_SPLIT_ALIGNED = 0.9999;

/** Corner numbers of one face, given as slots of that face's loop. */
export type SolidScriptMeshFacePiece = readonly number[];

/**
 * Reads the tags a mesh gave one of its faces.
 *
 * @param mesh Mesh.
 * @param face Face number.
 * @returns Tag names.
 */
export function solidScriptMeshFaceTagNames(mesh: SolidScriptShapeMesh, face: number): string[] {
  const loop = mesh.faces[face] ?? [];
  const normal = solidScriptMeshLoopNormal(mesh.points, loop);
  const corners = loop.flatMap((index) => mesh.points[index] ?? []);
  const names = (mesh.faceTags ?? [])
    .filter((tag) => tag.normal.dot(normal) > SOLID_SCRIPT_MESH_FACE_SPLIT_ALIGNED)
    .filter((tag) => solidScriptGeometryFaceHolds(corners, normal, tag.point))
    .map((tag) => tag.tag);
  return [...new Set(names)];
}

/**
 * Tags each new face with the tags of the face it was cut from.
 *
 * @param points Mesh points.
 * @param loops New faces.
 * @param names Tags of the face they came from.
 * @returns Tags at the new faces.
 */
function solidScriptMeshFaceSplitTags(
  points: SolidScriptShapeMesh['points'],
  loops: readonly (readonly number[])[],
  names: readonly string[],
): SolidScriptFaceTag[] {
  return loops.flatMap((loop) => {
    const point = solidScriptMeshLoopCenter(points, loop);
    const normal = solidScriptMeshLoopNormal(points, loop);
    return names.map((tag) => ({ point: point.clone(), normal: normal.clone(), tag }));
  });
}

/**
 * Replaces faces of a mesh with smaller faces made of their own corners, such
 * as the triangles of a quad. Each piece keeps the texture coordinates and tags
 * of its face; faces without pieces stay as they are.
 *
 * @param mesh Mesh.
 * @param pieces Pieces per face number, each a list of slots of that face's
 *   loop.
 * @returns Mesh with the faces replaced.
 */
export function solidScriptMeshFacesSplit(
  mesh: SolidScriptShapeMesh,
  pieces: ReadonlyMap<number, readonly SolidScriptMeshFacePiece[]>,
): SolidScriptShapeMesh {
  const faces: number[][] = [];
  const uvs: SolidScriptShapeMesh['uvs'] = [];
  const tags: SolidScriptFaceTag[] = [...(mesh.faceTags ?? [])];
  mesh.faces.forEach((loop, face) => {
    const split = pieces.get(face);
    const uv = mesh.uvs[face] ?? null;
    if (!split) {
      faces.push([...loop]);
      uvs.push(uv);
      return;
    }
    const loops = split.map((piece) => piece.map((slot) => loop[slot] ?? 0));
    faces.push(...loops);
    uvs.push(...split.map((piece) => (uv ? piece.map((slot): SolidScriptUv => [...(uv[slot] ?? [0, 0])]) : null)));
    tags.push(...solidScriptMeshFaceSplitTags(mesh.points, loops, solidScriptMeshFaceTagNames(mesh, face)));
  });
  return { ...mesh, faces, uvs, ...(tags.length > 0 ? { faceTags: tags } : {}) };
}
