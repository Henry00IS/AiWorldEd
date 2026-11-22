import * as THREE from 'three';
import type { SolidScriptShapeMesh, SolidScriptUv } from './solid_script_mesh.js';

/**
 * How Merge By Distance welds: Connected welds only the two ends of an edge
 * shorter than the distance; Welds tells which corners may be welded at all.
 */
export interface SolidScriptMeshMergeOptions {
  connected: boolean;
  welds: (point: number) => boolean;
}

/** Welds every corner that may be welded, in any part of the mesh. */
const SOLID_SCRIPT_MESH_MERGE_ALL: SolidScriptMeshMergeOptions = { connected: false, welds: () => true };

/**
 * Welds corners closer than a distance into one, at their first corner, and
 * drops the faces that fold to fewer than three corners.
 *
 * @param mesh Mesh.
 * @param distance Largest gap that is welded, in metres.
 * @param options Which corners may weld, and whether only along edges.
 * @returns Mesh with fewer corners.
 */
export function solidScriptMeshMerge(
  mesh: SolidScriptShapeMesh,
  distance: number,
  options: SolidScriptMeshMergeOptions = SOLID_SCRIPT_MESH_MERGE_ALL,
): SolidScriptShapeMesh {
  const roots = options.connected
    ? solidScriptMeshMergeConnected(mesh, distance, options.welds)
    : solidScriptMeshMergeNear(mesh.points, distance, options.welds);
  const kept: THREE.Vector3[] = [];
  const places = new Map<number, number>();
  const target = roots.map((root) => {
    const known = places.get(root);
    if (known !== undefined) return known;
    places.set(root, kept.length);
    kept.push(mesh.points[root]!.clone());
    return kept.length - 1;
  });
  return { ...mesh, points: kept, ...solidScriptMeshMergeFaces(mesh, target) };
}

/**
 * Finds, for each corner, the first earlier corner within the distance, through
 * a grid of cells one distance wide.
 *
 * @param points Corners.
 * @param distance Largest gap that is welded.
 * @param welds Which corners may be welded.
 * @returns Corner each one welds to, itself when none.
 */
export function solidScriptMeshMergeNear(
  points: readonly THREE.Vector3[],
  distance: number,
  welds: (point: number) => boolean,
): number[] {
  const cell = Math.max(distance, 1e-9);
  const cells = new Map<string, number[]>();
  return points.map((point, index) => {
    if (!welds(index)) return index;
    const [x, y, z] = [point.x, point.y, point.z].map((value) => Math.floor(value / cell)) as [number, number, number];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const other of cells.get(`${x + dx},${y + dy},${z + dz}`) ?? [])
            if (points[other]!.distanceTo(point) <= distance) return other;
    const key = `${x},${y},${z}`;
    cells.set(key, [...(cells.get(key) ?? []), index]);
    return index;
  });
}

/**
 * Joins the ends of every edge shorter than the distance whose ends may both be
 * welded, so corners weld only along the surface.
 *
 * @param mesh Mesh.
 * @param distance Largest edge length that is welded.
 * @param welds Which corners may be welded.
 * @returns Corner each one welds to: the first corner of its joined group.
 */
function solidScriptMeshMergeConnected(
  mesh: SolidScriptShapeMesh,
  distance: number,
  welds: (point: number) => boolean,
): number[] {
  const parent = mesh.points.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) index = parent[index] = parent[parent[index]!]!;
    return index;
  };
  for (const face of mesh.faces)
    face.forEach((a, corner) => {
      const b = face[(corner + 1) % face.length]!;
      if (!welds(a) || !welds(b) || mesh.points[a]!.distanceTo(mesh.points[b]!) > distance) return;
      const [low, high] = [root(a), root(b)].sort((left, right) => left - right) as [number, number];
      parent[high] = low;
    });
  return parent.map((_, index) => root(index));
}

/**
 * Rebuilds the faces on welded corners: repeated corners in a row become one,
 * and faces left with fewer than three corners are dropped.
 *
 * @param mesh Mesh before welding.
 * @param target New corner number of each old corner.
 * @returns Faces and their corner coordinates.
 */
function solidScriptMeshMergeFaces(
  mesh: SolidScriptShapeMesh,
  target: readonly number[],
): { faces: number[][]; uvs: (SolidScriptUv[] | null)[] } {
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
  return { faces, uvs };
}
