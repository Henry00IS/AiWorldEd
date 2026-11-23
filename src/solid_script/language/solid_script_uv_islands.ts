import {
  textureUvPackIslands,
  textureUvPackTurned,
  type TextureUvIsland,
} from '@/texture/uv_project/texture_uv_pack.js';
import { textureUvPackProfiles, type TextureUvPackShape } from '@/texture/uv_project/texture_uv_pack_profile.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from './solid_script_geometry.js';

/** How islands are packed: by bounding box, convex hull or exact shape. */
export type SolidScriptUvPackMethod = 'Bounding Box' | TextureUvPackShape;

/**
 * How islands are packed: the gap, whether they turn, the method and the area
 * they fill.
 */
export interface SolidScriptUvPackSettings {
  /** Gap between islands, as a share of the area's height. */
  margin: number;
  /** True to turn each island for the best fit. */
  rotate: boolean;
  /** Bounding Box, Convex Hull or Exact Shape. */
  method: SolidScriptUvPackMethod;
  /** Bottom left corner of the area, U and V. */
  from: readonly [number, number];
  /** Top right corner of the area, U and V. */
  to: readonly [number, number];
}

/**
 * Packs the UV islands of faces into an area: faces that share a corner at the
 * same place with the same UV move together as one island. Islands keep their
 * shape and are scaled alike to fill the area.
 *
 * @param faces Faces.
 * @param uvs Each face's corner UVs, in corner order.
 * @param settings Margin, Rotate, Method and the area.
 * @returns Packed corner UVs per face, in the same order.
 */
export function solidScriptUvIslandsPack(
  faces: readonly SolidScriptFaceFacts[],
  uvs: readonly TextureUvIsland[],
  settings: SolidScriptUvPackSettings,
): [number, number][][] {
  const islands = solidScriptUvIslands(faces, uvs);
  const width = settings.to[0] - settings.from[0];
  const height = settings.to[1] - settings.from[1];
  const corners = islands.map((island) => island.flatMap((index) => uvs[index] ?? []));
  const turned = settings.rotate ? corners.map(textureUvPackTurned) : corners;
  const scaled = turned.map((island) => island.map(([u, v]): [number, number] => [(u * height) / width, v]));
  const packed = solidScriptUvIslandsPlace(islands, uvs, scaled, settings).map((island) =>
    island.map(([u, v]): [number, number] => [settings.from[0] + u * width, settings.from[1] + v * height]),
  );
  const result = uvs.map((face) => face.map(([u, v]): [number, number] => [u, v]));
  islands.forEach((island, at) =>
    solidScriptUvIslandsSplit(island, uvs, packed[at] ?? []).forEach((face, next) => (result[island[next]!] = face)),
  );
  return result;
}

/**
 * Packs islands into the 0–1 square by the chosen method.
 *
 * @param islands Face numbers of each island.
 * @param uvs Each face's corner UVs, in corner order.
 * @param corners Every island's corners, face after face.
 * @param settings Margin, Rotate and Method.
 * @returns Packed corners of every island, face after face.
 */
function solidScriptUvIslandsPlace(
  islands: readonly number[][],
  uvs: readonly TextureUvIsland[],
  corners: readonly TextureUvIsland[],
  settings: SolidScriptUvPackSettings,
): [number, number][][] {
  if (settings.method === 'Bounding Box') return textureUvPackIslands(corners, settings.margin);
  const loops = islands.map((island, at) => solidScriptUvIslandsSplit(island, uvs, corners[at] ?? []));
  return textureUvPackProfiles(loops, settings.margin, settings.method, settings.rotate).map((island) => island.flat());
}

/**
 * Splits an island's corners, face after face, back into one loop per face.
 *
 * @param island Face numbers of the island.
 * @param uvs Each face's corner UVs, giving each face's corner count.
 * @param corners The island's corners, face after face.
 * @returns Corner loop of each face.
 */
function solidScriptUvIslandsSplit(
  island: readonly number[],
  uvs: readonly TextureUvIsland[],
  corners: TextureUvIsland,
): [number, number][][] {
  let next = 0;
  return island.map((index) => {
    const count = uvs[index]?.length ?? 0;
    next += count;
    return corners.slice(next - count, next).map(([u, v]): [number, number] => [u, v]);
  });
}

/**
 * Groups faces into UV islands: faces of one solid or mesh that share a corner
 * at the same place with the same UV are in one island.
 *
 * @param faces Faces.
 * @param uvs Each face's corner UVs, in corner order.
 * @returns Face numbers of each island.
 */
function solidScriptUvIslands(faces: readonly SolidScriptFaceFacts[], uvs: readonly TextureUvIsland[]): number[][] {
  const owner = faces.map((_, index) => index);
  const root = (index: number): number => {
    const above = owner[index] ?? index;
    return above === index ? index : (owner[index] = root(above));
  };
  const seen = new Map<string, number>();
  const leaves = new Map<SolidScriptGeometryLeaf, number>();
  faces.forEach((face, index) =>
    face.corners.forEach((corner, at) => {
      const leaf = leaves.get(face.leaf) ?? leaves.set(face.leaf, leaves.size).size - 1;
      const [u = 0, v = 0] = uvs[index]?.[at] ?? [];
      const key = [leaf, corner.x, corner.y, corner.z, u, v].map((value) => value.toFixed(5)).join(',');
      const other = seen.get(key);
      if (other === undefined) seen.set(key, index);
      else owner[root(index)] = root(other);
    }),
  );
  const islands = new Map<number, number[]>();
  faces.forEach((_, index) => islands.set(root(index), [...(islands.get(root(index)) ?? []), index]));
  return [...islands.values()];
}
