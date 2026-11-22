import { textureUvPackIslands, type TextureUvIsland } from '@/texture/uv_project/texture_uv_pack.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from './solid_script_geometry.js';

/**
 * Packs the UV islands of faces into the 0 to 1 square: faces that share a
 * corner at the same place with the same UV move together as one island.
 *
 * @param faces Faces.
 * @param uvs Each face's corner UVs, in corner order.
 * @param margin Gap between islands, as a share of the square.
 * @returns Packed corner UVs per face, in the same order.
 */
export function solidScriptUvIslandsPack(
  faces: readonly SolidScriptFaceFacts[],
  uvs: readonly TextureUvIsland[],
  margin: number,
): [number, number][][] {
  const islands = solidScriptUvIslands(faces, uvs);
  const packed = textureUvPackIslands(
    islands.map((island) => island.flatMap((index) => uvs[index] ?? [])),
    margin,
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
