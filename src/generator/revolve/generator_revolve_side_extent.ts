import type { GeneratorRevolveSidePiece, GeneratorRevolveSideRing } from './generator_revolve_side.js';

/** The +X and -X extents and depth of one ring, in curve units. */
export interface GeneratorRevolveSideExtent {
  /** +X extent. */
  right: number;
  /** -X extent. */
  left: number;
  /** Half-width whose depth the ring uses; absent follows the ring's width. */
  depth?: number;
}

/** Smallest half-width a fixed depth is taken from, in curve units. */
const GENERATOR_REVOLVE_SIDE_DEPTH_EPSILON = 1e-6;

/**
 * Measures the extents of every piece's rings. A one-sided run keeps its other
 * side at the run's smallest profile value; a fixed-depth run keeps the depth
 * of its lowest ring that has a width.
 *
 * @param pieces Pieces bottom to top.
 * @returns Lower and upper ring extents per piece.
 */
export function generatorRevolveSideExtents(
  pieces: readonly GeneratorRevolveSidePiece[],
): [GeneratorRevolveSideExtent, GeneratorRevolveSideExtent][] {
  const held = generatorRevolveSideRuns(
    pieces,
    (piece) => piece.section.side === 'negative' || piece.section.side === 'positive',
    (piece) => piece.section.side ?? '',
    (group) => Math.min(...group.flatMap((piece) => [piece.start.y, piece.end.y])),
  );
  const extents = pieces.map((piece, index) => {
    const side = (ring: GeneratorRevolveSideRing) => generatorRevolveSideExtent(piece, ring, held[index] ?? ring.y);
    return [side(piece.start), side(piece.end)] as [GeneratorRevolveSideExtent, GeneratorRevolveSideExtent];
  });
  return generatorRevolveSideFixedDepths(pieces, extents);
}

/**
 * Gives every ring of a fixed-depth run the depth of the run's lowest ring with
 * width.
 *
 * @param pieces Pieces bottom to top.
 * @param extents Lower and upper ring extents per piece.
 * @returns Extents with the fixed depths.
 */
function generatorRevolveSideFixedDepths(
  pieces: readonly GeneratorRevolveSidePiece[],
  extents: [GeneratorRevolveSideExtent, GeneratorRevolveSideExtent][],
): [GeneratorRevolveSideExtent, GeneratorRevolveSideExtent][] {
  const widths = extents.flatMap((pair) => pair.map((extent) => (extent.right + extent.left) / 2));
  const depths = generatorRevolveSideRuns(
    pieces,
    (piece) => !!piece.section.fixedDepth,
    () => 'fixed',
    (_, begin, end) => generatorRevolveSideDepth(widths.slice(begin * 2, end * 2 + 2)),
  );
  return extents.map((pair, index) => {
    const depth = depths[index];
    return depth === undefined ? pair : (pair.map((extent) => ({ ...extent, depth })) as typeof pair);
  });
}

/**
 * Returns the +X and -X extents of a ring for its piece's side mode.
 *
 * @param piece Piece.
 * @param ring Ring of the piece.
 * @param held Value the still side keeps for one-sided pieces.
 * @returns Extents without depth.
 */
function generatorRevolveSideExtent(
  piece: GeneratorRevolveSidePiece,
  ring: GeneratorRevolveSideRing,
  held: number,
): GeneratorRevolveSideExtent {
  const side = piece.section.side;
  if (side === 'negative') return { right: held, left: ring.y };
  if (side === 'positive') return { right: ring.y, left: held };
  if (side === 'custom') return { right: ring.y, left: ring.left ?? ring.y };
  return { right: ring.y, left: ring.y };
}

/**
 * Picks the depth of a fixed-depth run: its lowest ring with a width, or
 * nothing wide at all.
 *
 * @param widths Half-widths of the run's rings, bottom to top.
 * @returns Half-width the run's depth follows.
 */
function generatorRevolveSideDepth(widths: readonly number[]): number {
  return widths.find((width) => width > GENERATOR_REVOLVE_SIDE_DEPTH_EPSILON) ?? 0;
}

/**
 * Groups neighbouring pieces that share a key and gives every member of a group
 * the group's measure.
 *
 * @param pieces Pieces bottom to top.
 * @param member Whether a piece belongs to any group.
 * @param key Key neighbours must share to join one group.
 * @param measure Measure of one group from its pieces and index range.
 * @returns Group measure per piece; undefined for pieces outside groups.
 */
function generatorRevolveSideRuns(
  pieces: readonly GeneratorRevolveSidePiece[],
  member: (piece: GeneratorRevolveSidePiece) => boolean,
  key: (piece: GeneratorRevolveSidePiece) => string,
  measure: (group: readonly GeneratorRevolveSidePiece[], begin: number, end: number) => number,
): (number | undefined)[] {
  const result: (number | undefined)[] = pieces.map(() => undefined);
  let begin = 0;
  pieces.forEach((piece, index) => {
    const next = pieces[index + 1];
    const joins = next && member(next) && member(piece) && key(next) === key(piece);
    if (joins) return;
    if (member(piece)) result.fill(measure(pieces.slice(begin, index + 1), begin, index), begin, index + 1);
    begin = index + 1;
  });
  return result;
}
