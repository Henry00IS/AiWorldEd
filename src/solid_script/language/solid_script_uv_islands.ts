import {
  textureUvPackIslands,
  textureUvPackTurned,
  type TextureUvIsland,
} from '@/texture/uv_project/texture_uv_pack.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from './solid_script_geometry.js';

/** How islands are packed: the gap, whether they turn, and the area they fill. */
export interface SolidScriptUvPackSettings {
  /** Gap between islands, as a share of the area's height. */
  margin: number;
  /** True to turn each island for the best fit. */
  rotate: boolean;
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
 * @param settings Margin, Rotate and the area.
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
  const packed = textureUvPackIslands(
    turned.map((island) => island.map(([u, v]): [number, number] => [(u * height) / width, v])),
    settings.margin,
  ).map((island) =>
    island.map(([u, v]): [number, number] => [settings.from[0] + u * width, settings.from[1] + v * height]),
  );
  const result = uvs.map((face) => face.map(([u, v]): [number, number] => [u, v]));
  islands.forEach((island, at) =>
    island.reduce((next, index) => {
      const count = uvs[index]?.length ?? 0;
      result[index] = (packed[at] ?? []).slice(next, next + count);
      return next + count;
    }, 0),
  );
  return result;
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
