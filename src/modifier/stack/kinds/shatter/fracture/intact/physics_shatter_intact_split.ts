import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import {
  physicsShatterCarve,
  physicsShatterPolytopeWithOrigins,
  type PhysicsShatterCutter,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_carve.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import {
  physicsShatterPieceShape,
  physicsShatterPieceShapeSound,
  type PhysicsShatterPieceBounds,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_quality.js';
import { physicsShatterIntactMergeAll, type PhysicsShatterIntactPart } from './physics_shatter_intact_merge.js';

/** Most cutting orders tried per input; each starts its planes elsewhere. */
const PHYSICS_SHATTER_INTACT_ORDER_TRIES = 4;

/** Convex parts of one input with what they lost and how sound they are. */
export interface PhysicsShatterIntactSplit {
  /** Built convex parts, disjoint, in a deterministic order. */
  parts: PhysicsShatterIntactPart[];
  /** Volume of carved fragments too degenerate to build. */
  failedVolume: number;
  /** Number of carved fragments too degenerate to build. */
  failedParts: number;
  /** Number of parts short of the bounds: too thin, a short edge or small face. */
  unsoundParts: number;
  /** Thickness of the thinnest part. */
  thinnest: number;
}

/**
 * Splits what the cutters leave of a convex input into convex parts. Several
 * cutting orders are tried and the best split is kept: the fewest broken
 * fragments, then the fewest parts short of the bounds, then the fewest parts,
 * then the thickest thinnest part. Parts whose union is convex are merged.
 *
 * @param brush Input brush.
 * @param origins Face origin per input face.
 * @param cutters Later inputs that overlap the input with real volume.
 * @param bounds Thickness, edge and face bounds a sound part meets.
 * @returns Best split found.
 */
export function physicsShatterIntactSplitBest(
  brush: SolidBrush,
  origins: readonly number[],
  cutters: readonly PhysicsShatterCutter[],
  bounds: PhysicsShatterPieceBounds,
): PhysicsShatterIntactSplit {
  let best: PhysicsShatterIntactSplit | null = null;
  for (const ordered of physicsShatterIntactOrders(cutters)) {
    const split = physicsShatterIntactSplitOnce(brush, origins, ordered, bounds);
    if (!best || physicsShatterIntactSplitBetter(split, best)) best = split;
  }
  return best ?? physicsShatterIntactSplitOnce(brush, origins, cutters, bounds);
}

/**
 * Returns the cutters once per cutting order to try: each order rotates every
 * cutter's planes to start at a different face, forwards and backwards.
 *
 * @param cutters Cutters in face order.
 * @returns Cutter lists with face orders, the plain face order first.
 */
function physicsShatterIntactOrders(cutters: readonly PhysicsShatterCutter[]): PhysicsShatterCutter[][] {
  const orders: PhysicsShatterCutter[][] = [];
  for (let attempt = 0; attempt < PHYSICS_SHATTER_INTACT_ORDER_TRIES; attempt++) {
    for (const backwards of [false, true]) {
      orders.push(cutters.map((cutter) => physicsShatterIntactOrdered(cutter, attempt, backwards)));
    }
  }
  return orders;
}

/**
 * Returns a cutter whose planes cut in a rotated, maybe reversed, face order.
 *
 * @param cutter Cutter.
 * @param attempt Which of the evenly spaced starting faces to use.
 * @param backwards True to walk the faces in reverse.
 * @returns Cutter with a face order.
 */
function physicsShatterIntactOrdered(
  cutter: PhysicsShatterCutter,
  attempt: number,
  backwards: boolean,
): PhysicsShatterCutter {
  const count = cutter.planes.length;
  const start = Math.floor((attempt * count) / PHYSICS_SHATTER_INTACT_ORDER_TRIES);
  const faceOrder = cutter.planes.map((_plane, step) => {
    const offset = backwards ? count - step : step;
    return (((start + offset) % count) + count) % count;
  });
  return { ...cutter, faceOrder };
}

/**
 * Carves the input with the cutters in their face orders, builds the fragments
 * and merges those whose union is convex.
 *
 * @param brush Input brush.
 * @param origins Face origin per input face.
 * @param cutters Ordered cutters.
 * @param bounds Part bounds.
 * @returns Split.
 */
function physicsShatterIntactSplitOnce(
  brush: SolidBrush,
  origins: readonly number[],
  cutters: readonly PhysicsShatterCutter[],
  bounds: PhysicsShatterPieceBounds,
): PhysicsShatterIntactSplit {
  const split: PhysicsShatterIntactSplit = {
    parts: [],
    failedVolume: 0,
    failedParts: 0,
    unsoundParts: 0,
    thinnest: Infinity,
  };
  const built: PhysicsShatterIntactPart[] = [];
  for (const fragment of physicsShatterCarve(brush, origins, cutters)) {
    const part = fragment.toBrush();
    if (part) built.push(part);
    else {
      split.failedParts++;
      split.failedVolume += Math.max(0, fragment.volume());
    }
  }
  split.parts = physicsShatterIntactMergeAll(built, physicsShatterPolytopeWithOrigins(brush, origins));
  physicsShatterIntactSplitMeasure(split, bounds);
  return split;
}

/**
 * Counts the parts short of the bounds and finds the thinnest.
 *
 * @param split Split to measure in place.
 * @param bounds Part bounds.
 */
function physicsShatterIntactSplitMeasure(split: PhysicsShatterIntactSplit, bounds: PhysicsShatterPieceBounds): void {
  for (const part of split.parts) {
    const shape = physicsShatterPieceShape(part.brush);
    split.thinnest = Math.min(split.thinnest, shape.thickness);
    const valid = SolidBrushValidator.validateGenerated(part.brush).valid;
    if (!valid || !physicsShatterPieceShapeSound(shape, bounds)) split.unsoundParts++;
  }
}

/**
 * Returns whether one split beats another.
 *
 * @param candidate New split.
 * @param best Best split so far.
 * @returns True when the candidate is better.
 */
function physicsShatterIntactSplitBetter(
  candidate: PhysicsShatterIntactSplit,
  best: PhysicsShatterIntactSplit,
): boolean {
  if (candidate.failedParts !== best.failedParts) return candidate.failedParts < best.failedParts;
  if (candidate.unsoundParts !== best.unsoundParts) return candidate.unsoundParts < best.unsoundParts;
  if (candidate.parts.length !== best.parts.length) return candidate.parts.length < best.parts.length;
  return candidate.thinnest > best.thinnest;
}

/**
 * Sums the volume of some parts.
 *
 * @param parts Parts.
 * @returns Volume in cubic metres.
 */
export function physicsShatterIntactPartsVolume(parts: readonly PhysicsShatterIntactPart[]): number {
  return parts.reduce((sum, part) => sum + physicsShatterBrushVolume(part.brush), 0);
}
