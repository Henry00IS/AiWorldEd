import * as THREE from 'three';
import { generatorRevolveBlendHull2d } from '@/generator/revolve/generator_revolve_blend_shape.js';
import type { TextureUvIsland } from './texture_uv_pack.js';

/** How tightly islands are packed: by their convex hull or their exact shape. */
export type TextureUvPackShape = 'Convex Hull' | 'Exact Shape';

/** Columns across the packing width. */
const TEXTURE_UV_PACK_COLUMNS = 160;

/** Packing widths tried, as shares of the square root of the islands' area. */
const TEXTURE_UV_PACK_WIDTHS = [0.9, 1, 1.15, 1.3, 1.5, 1.8];

/** One island ready to place: its faces at the origin and its size. */
interface TextureUvPackPiece {
  faces: [number, number][][];
  width: number;
  height: number;
}

/** Lowest and highest V an island covers in every column, from its left side. */
interface TextureUvPackProfile {
  bottom: number[];
  top: number[];
}

/**
 * Packs islands, each a list of face loops, into the 0–1 square by their shape
 * rather than their bounding box: islands are placed largest first, each as low
 * as it fits on the skyline of those placed before, so a notch or a slanted
 * side takes the next island in. Convex Hull packs by each island's convex
 * hull, Exact Shape by its faces. With Turn each island also tries quarter and
 * half turns. Islands keep their shape and are scaled alike.
 *
 * @param islands Face loops of every island.
 * @param margin Gap between islands, as a share of the packing width.
 * @param shape Convex Hull or Exact Shape.
 * @param turn True to try quarter and half turns.
 * @returns Packed face loops, in the same order.
 */
export function textureUvPackProfiles(
  islands: readonly (readonly TextureUvIsland[])[],
  margin: number,
  shape: TextureUvPackShape,
  turn: boolean,
): [number, number][][][] {
  const pieces = islands.map((faces) => textureUvPackPiece(faces.map((face) => face.map(([u, v]) => [u, v]))));
  const area = pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0);
  const widest = Math.max(0, ...pieces.map((piece) => Math.max(piece.width, turn ? piece.height : 0)));
  if (!(area > 0)) return islands.map((faces) => faces.map((face) => face.map(([u, v]) => [u, v])));
  const tries = TEXTURE_UV_PACK_WIDTHS.map((share) =>
    textureUvPackTry(pieces, Math.max(widest * (1 + 2 * margin), Math.sqrt(area) * share), margin, shape, turn),
  );
  const best = tries.reduce((left, right) => (right.size < left.size ? right : left));
  return best.placed.map((faces) => faces.map((face) => face.map(([u, v]) => [u / best.size, v / best.size])));
}

/**
 * Shifts an island's faces so its lowest U and V are 0, and measures it.
 *
 * @param faces Face loops.
 * @returns Piece at the origin.
 */
function textureUvPackPiece(faces: [number, number][][]): TextureUvPackPiece {
  const corners = faces.flat();
  const minU = Math.min(...corners.map(([u]) => u));
  const minV = Math.min(...corners.map(([, v]) => v));
  const moved = faces.map((face) => face.map(([u, v]): [number, number] => [u - minU, v - minV]));
  const flat = moved.flat();
  return {
    faces: moved,
    width: Math.max(0, ...flat.map(([u]) => u)),
    height: Math.max(0, ...flat.map(([, v]) => v)),
  };
}

/**
 * Packs every piece at one packing width.
 *
 * @param pieces Islands at the origin.
 * @param width Packing width.
 * @param margin Gap, as a share of the width.
 * @param shape Convex Hull or Exact Shape.
 * @param turn True to try quarter and half turns.
 * @returns Placed face loops by island, and the side of the square they need.
 */
function textureUvPackTry(
  pieces: readonly TextureUvPackPiece[],
  width: number,
  margin: number,
  shape: TextureUvPackShape,
  turn: boolean,
): { placed: [number, number][][][]; size: number } {
  const column = width / TEXTURE_UV_PACK_COLUMNS;
  const sky = new Array<number>(TEXTURE_UV_PACK_COLUMNS).fill(0);
  const placed: [number, number][][][] = pieces.map(() => []);
  const order = pieces.map((_, index) => index);
  order.sort((a, b) => pieces[b]!.width * pieces[b]!.height - pieces[a]!.width * pieces[a]!.height);
  for (const index of order) {
    const options = textureUvPackTurns(pieces[index]!, turn);
    placed[index] = textureUvPackPlace(options, sky, column, margin * width, shape);
  }
  const corners = placed.flat(2);
  const size = Math.max(...corners.map(([u]) => u), ...corners.map(([, v]) => v), 1e-12);
  return { placed, size };
}

/**
 * The ways an island may face: as it is, or also turned by quarter and half
 * turns.
 *
 * @param piece Island at the origin.
 * @param turn True to try turns.
 * @returns Pieces at the origin.
 */
function textureUvPackTurns(piece: TextureUvPackPiece, turn: boolean): TextureUvPackPiece[] {
  if (!turn) return [piece];
  const turns: ((u: number, v: number) => [number, number])[] = [
    (u, v) => [-v, u],
    (u, v) => [-u, -v],
    (u, v) => [v, -u],
  ];
  return [piece, ...turns.map((map) => textureUvPackPiece(piece.faces.map((face) => face.map(([u, v]) => map(u, v)))))];
}

/**
 * Places an island at the lowest spot on the skyline, trying every column and
 * every way it may face, and raises the skyline under it.
 *
 * @param options Ways the island may face.
 * @param sky Skyline height per column, changed in place.
 * @param column Width of a column.
 * @param gap Gap between islands.
 * @param shape Convex Hull or Exact Shape.
 * @returns Placed face loops.
 */
function textureUvPackPlace(
  options: readonly TextureUvPackPiece[],
  sky: number[],
  column: number,
  gap: number,
  shape: TextureUvPackShape,
): [number, number][][] {
  let best = {
    score: Infinity,
    x: 0,
    y: 0,
    piece: options[0]!,
    profile: { bottom: [] as number[], top: [] as number[] },
  };
  for (const piece of options) {
    const profile = textureUvPackProfile(piece, column, gap, shape);
    for (let x = 0; x + profile.bottom.length <= sky.length; x++) {
      const y = textureUvPackRest(profile, sky, x);
      const score = y + piece.height + x * column * 1e-6;
      if (score < best.score) best = { score, x, y, piece, profile };
    }
  }
  textureUvPackRaise(sky, best.profile, best.x, best.y + gap);
  return best.piece.faces.map((face) => face.map(([u, v]): [number, number] => [u + best.x * column, v + best.y]));
}

/**
 * Raises the skyline over a placed island.
 *
 * @param sky Skyline height per column, changed in place.
 * @param profile Island profile.
 * @param x First column.
 * @param lift Height of the island's base, plus the gap.
 */
function textureUvPackRaise(sky: number[], profile: TextureUvPackProfile, x: number, lift: number): void {
  profile.top.forEach((top, at) => {
    if (top > -Infinity) sky[x + at] = Math.max(sky[x + at] ?? 0, lift + top);
  });
}

/**
 * How high an island must sit at a column so it clears the skyline there.
 *
 * @param profile Island profile.
 * @param sky Skyline height per column.
 * @param x First column.
 * @returns Lift of the island.
 */
function textureUvPackRest(profile: TextureUvPackProfile, sky: readonly number[], x: number): number {
  let lift = 0;
  profile.bottom.forEach((bottom, at) => {
    if (bottom < Infinity) lift = Math.max(lift, (sky[x + at] ?? 0) - bottom);
  });
  return lift;
}

/**
 * Measures the lowest and highest V an island covers in every column it spans,
 * each column widened by the gap on both sides.
 *
 * @param piece Island at the origin.
 * @param column Width of a column.
 * @param gap Gap between islands.
 * @param shape Convex Hull or Exact Shape.
 * @returns Profile, with Infinity and -Infinity for empty columns.
 */
function textureUvPackProfile(
  piece: TextureUvPackPiece,
  column: number,
  gap: number,
  shape: TextureUvPackShape,
): TextureUvPackProfile {
  const loops = shape === 'Convex Hull' ? [textureUvPackHull(piece)] : piece.faces;
  const count = Math.max(1, Math.ceil((piece.width + 1e-12) / column));
  const bottom = new Array<number>(count).fill(Infinity);
  const top = new Array<number>(count).fill(-Infinity);
  for (let at = 0; at < count; at++)
    for (const loop of loops) {
      const vs = textureUvPackSlab(loop, at * column - gap, (at + 1) * column + gap).map(([, v]) => v);
      if (vs.length > 0) [bottom[at], top[at]] = [Math.min(bottom[at]!, ...vs), Math.max(top[at]!, ...vs)];
    }
  return { bottom, top };
}

/**
 * The convex hull of an island's corners, or its corners when they lie in a
 * line.
 *
 * @param piece Island at the origin.
 * @returns Hull loop.
 */
function textureUvPackHull(piece: TextureUvPackPiece): [number, number][] {
  const corners = piece.faces.flat();
  const hull = generatorRevolveBlendHull2d(corners.map(([u, v]) => new THREE.Vector2(u, v)));
  return hull.length >= 3 ? hull.map((point): [number, number] => [point.x, point.y]) : corners;
}

/**
 * Cuts a loop down to the part between two U values.
 *
 * @param loop Corner loop.
 * @param from Lowest U.
 * @param to Highest U.
 * @returns Corners of the part, empty when none is left.
 */
function textureUvPackSlab(loop: readonly [number, number][], from: number, to: number): [number, number][] {
  const keep = (points: readonly [number, number][], inside: (u: number) => boolean, edge: number) =>
    points.flatMap((point, index): [number, number][] => {
      const next = points[(index + 1) % points.length]!;
      const crossing = inside(point[0]) !== inside(next[0]);
      const t = (edge - point[0]) / (next[0] - point[0]);
      const cut: [number, number] = [edge, point[1] + (next[1] - point[1]) * t];
      return [...(inside(point[0]) ? [point] : []), ...(crossing ? [cut] : [])];
    });
  return keep(
    keep(loop, (u) => u >= from, from),
    (u) => u <= to,
    to,
  );
}
