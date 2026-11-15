import * as THREE from 'three';
import { BLAST_HOLE_MIN_EDGE, BLAST_HOLE_MIN_THICKNESS } from './modifier_stack_blast_hole_quality.js';
import {
  blastHoleRaggedBaseCreate,
  blastHoleRaggedBaseSamples,
  blastHoleRaggedPoint,
  type BlastHoleRaggedBase,
} from './modifier_stack_blast_hole_ragged_base.js';
import {
  BLAST_HOLE_RAGGED_MAX_JAG,
  BLAST_HOLE_RAGGED_MIN_JAG,
  blastHoleRaggedLayerDepth,
  blastHoleRaggedLayers,
  type BlastHoleRaggedLayer,
  type BlastHoleRaggedSettings,
} from './modifier_stack_blast_hole_ragged_depth.js';
import { blastHoleCross, blastHoleChordHitsEdges } from './modifier_stack_blast_hole_simple.js';

/** Gap kept between the outline and the box sides, in metres. */
export const BLAST_HOLE_RAGGED_MARGIN = 0.02;

/**
 * Deepest share of the smaller half size a jag may cut in, so the hole stays
 * open.
 */
const BLAST_HOLE_RAGGED_DEPTH_SHARE = 0.6;

/** Least gap between the ring of inner points and the jags, in metres. */
const BLAST_HOLE_RAGGED_RING_GAP = 0.06;

/** Flattest corner the outline keeps, in degrees of turn. */
const BLAST_HOLE_RAGGED_MIN_TURN = 3;

/** Longest arc between samples on a round corner, as a share of its radius. */
const BLAST_HOLE_RAGGED_ARC_STEP = 0.2;

/**
 * Returns the Jagged settings clamped to their ranges.
 *
 * @param settings Settings as stored.
 * @returns Clamped settings.
 */
export function blastHoleRaggedSettingsClamp(settings: BlastHoleRaggedSettings): BlastHoleRaggedSettings {
  return {
    ...settings,
    shape: THREE.MathUtils.clamp(settings.shape, 0, 1),
    jagSize: THREE.MathUtils.clamp(settings.jagSize, BLAST_HOLE_RAGGED_MIN_JAG, BLAST_HOLE_RAGGED_MAX_JAG),
    roughness: THREE.MathUtils.clamp(settings.roughness, 0, 1),
  };
}

/** Base outline, depth layers and the share every depth is scaled by. */
interface BlastHoleRaggedPlan {
  base: BlastHoleRaggedBase;
  layers: BlastHoleRaggedLayer[];
  depthScale: number;
}

/**
 * Builds the base outline that fills the box minus the margin and the depth
 * layers along it. When the deepest cut would close up a small hole, every
 * depth is scaled down by the same share, never clamped flat.
 *
 * @param settings Clamped settings.
 * @param halfWidth Half the box width.
 * @param halfHeight Half the box height.
 * @returns Plan, or null when the box is too small for a hole.
 */
function blastHoleRaggedPlan(
  settings: BlastHoleRaggedSettings,
  halfWidth: number,
  halfHeight: number,
): BlastHoleRaggedPlan | null {
  const outerX = halfWidth - BLAST_HOLE_RAGGED_MARGIN;
  const outerY = halfHeight - BLAST_HOLE_RAGGED_MARGIN;
  if (Math.min(outerX, outerY) < BLAST_HOLE_MIN_THICKNESS) return null;
  const sizing = blastHoleRaggedBaseCreate(outerX, outerY, settings.shape, 0);
  const layers = blastHoleRaggedLayers(settings, sizing.perimeter);
  const deepest = Math.max(
    1e-9,
    ...blastHoleRaggedSamples(sizing, layers).map((at) => blastHoleRaggedSum(sizing, layers, at)),
  );
  const maxDepth = Math.min(BLAST_HOLE_RAGGED_DEPTH_SHARE * Math.min(outerX, outerY), deepest);
  return { base: { ...sizing, maxDepth }, layers, depthScale: maxDepth / deepest };
}

/**
 * Returns every arc length the outline needs a corner at: each layer's knots
 * and the base outline's own corners, sorted, without near duplicates.
 *
 * @param base Base outline.
 * @param layers Depth layers.
 * @returns Arc lengths within one lap.
 */
function blastHoleRaggedSamples(base: BlastHoleRaggedBase, layers: readonly BlastHoleRaggedLayer[]): number[] {
  const step = Math.max(BLAST_HOLE_MIN_THICKNESS, base.radius * BLAST_HOLE_RAGGED_ARC_STEP);
  const all = [...blastHoleRaggedBaseSamples(base, step), ...layers.flatMap((layer) => layer.knots)].sort(
    (a, b) => a - b,
  );
  return all.filter((sample, index) => index === 0 || sample - all[index - 1]! > BLAST_HOLE_MIN_EDGE * 0.1);
}

/**
 * Returns the sum of every layer's depth at an arc length.
 *
 * @param base Base outline.
 * @param layers Depth layers.
 * @param distance Arc length.
 * @returns Depth.
 */
function blastHoleRaggedSum(
  base: BlastHoleRaggedBase,
  layers: readonly BlastHoleRaggedLayer[],
  distance: number,
): number {
  return layers.reduce((sum, layer) => sum + blastHoleRaggedLayerDepth(layer, distance, base.perimeter), 0);
}

/** Raw Jagged outline and the inner points its split may use. */
export interface BlastHoleRaggedRaw {
  /** Counter-clockwise outline. */
  outline: THREE.Vector2[];
  /** Points on a ring just inside the usual jag depth, for a fat core. */
  ring: THREE.Vector2[];
}

/**
 * Builds the raw Jagged outline: the base outline walked by arc length and cut
 * in by the depth layers. Jag sizes are in metres along the edge, never a share
 * of the box, so wide holes get more jags, not wider ones.
 *
 * @param settings Settings.
 * @param halfWidth Half the box width.
 * @param halfHeight Half the box height.
 * @returns Outline and ring, or null when the box is too small.
 */
export function blastHoleRaggedRawOutline(
  settings: BlastHoleRaggedSettings,
  halfWidth: number,
  halfHeight: number,
): BlastHoleRaggedRaw | null {
  const clamped = blastHoleRaggedSettingsClamp(settings);
  const plan = blastHoleRaggedPlan(clamped, halfWidth, halfHeight);
  if (!plan) return null;
  const { base, layers, depthScale } = plan;
  const outline = blastHoleRaggedSamples(base, layers).map((distance) =>
    blastHoleRaggedPoint(base, distance, blastHoleRaggedSum(base, layers, distance) * depthScale),
  );
  return { outline, ring: blastHoleRaggedRing(plan, clamped.jagSize) };
}

/**
 * Places the ring of inner points: evenly along the base outline, one Jag Size
 * apart, cut in past the deepest noise jag but not past the bites.
 *
 * @param plan Plan.
 * @param jagSize Jag Size.
 * @returns Ring points; some may fall outside the outline at bites.
 */
function blastHoleRaggedRing(plan: BlastHoleRaggedPlan, jagSize: number): THREE.Vector2[] {
  const { base, layers, depthScale } = plan;
  const noise = layers.filter((layer) => !layer.bite);
  const samples = blastHoleRaggedSamples(base, noise);
  const noiseDepth = Math.max(0, ...samples.map((at) => blastHoleRaggedSum(base, noise, at))) * depthScale;
  const depth = noiseDepth + Math.max(BLAST_HOLE_RAGGED_RING_GAP, jagSize * 0.3);
  const count = Math.max(8, Math.round(base.perimeter / (jagSize * 1.6)));
  const ring = Array.from({ length: count }, (_, index) =>
    blastHoleRaggedPoint(base, (index / count) * base.perimeter, depth),
  );
  return ring.filter((point, index) => index === 0 || point.distanceTo(ring[index - 1]!) > jagSize * 0.8);
}

/**
 * Returns whether a corner should go: its edges are too short, or it barely
 * turns, or it folds back into a needle.
 *
 * @param previous Previous point.
 * @param point Corner.
 * @param next Next point.
 * @returns True to remove it.
 */
function blastHoleRaggedCornerWeak(previous: THREE.Vector2, point: THREE.Vector2, next: THREE.Vector2): boolean {
  const before = point.distanceTo(previous);
  const after = point.distanceTo(next);
  if (Math.min(before, after) < BLAST_HOLE_MIN_EDGE * 2) return true;
  const sine = Math.abs(blastHoleCross(previous, point, next)) / Math.max(1e-12, before * after);
  return sine < Math.sin(THREE.MathUtils.degToRad(BLAST_HOLE_RAGGED_MIN_TURN));
}

/**
 * Returns whether removing a corner keeps the outline simple: the chord that
 * replaces it hits no other edge and no other corner lies in the cut triangle.
 *
 * @param outline Outline.
 * @param index Corner index.
 * @returns True when the corner may go.
 */
export function blastHoleRaggedCornerRemovable(outline: readonly THREE.Vector2[], index: number): boolean {
  const count = outline.length;
  if (count <= 3) return false;
  const previous = (index + count - 1) % count;
  const next = (index + 1) % count;
  if (blastHoleChordHitsEdges(outline, previous, next)) return false;
  return !outline.some(
    (point, other) =>
      other !== index && other !== previous && other !== next && blastHoleRaggedInTriangle(outline, index, point),
  );
}

/**
 * Returns whether a point lies in or on the triangle a corner cuts off.
 *
 * @param outline Outline.
 * @param index Corner index.
 * @param point Point.
 * @returns True inside or on the triangle.
 */
function blastHoleRaggedInTriangle(outline: readonly THREE.Vector2[], index: number, point: THREE.Vector2): boolean {
  const count = outline.length;
  const a = outline[(index + count - 1) % count]!;
  const b = outline[index]!;
  const c = outline[(index + 1) % count]!;
  const sign = Math.sign(blastHoleCross(a, b, c));
  if (point.equals(a) || point.equals(b) || point.equals(c)) return false;
  return (
    blastHoleCross(a, b, point) * sign >= 0 &&
    blastHoleCross(b, c, point) * sign >= 0 &&
    blastHoleCross(c, a, point) * sign >= 0
  );
}

/**
 * Removes weak corners, one sweep at a time, as long as the outline stays
 * simple.
 *
 * @param outline Raw outline.
 * @returns Cleaned outline.
 */
export function blastHoleRaggedClean(outline: readonly THREE.Vector2[]): THREE.Vector2[] {
  const points = outline.map((point) => point.clone());
  for (let sweep = 0; sweep < 16; sweep++) {
    let removed = false;
    for (let index = points.length - 1; index >= 0 && points.length > 3; index--) {
      const at = index % points.length;
      const count = points.length;
      const weak = blastHoleRaggedCornerWeak(points[(at + count - 1) % count]!, points[at]!, points[(at + 1) % count]!);
      if (weak && blastHoleRaggedCornerRemovable(points, at)) {
        points.splice(at, 1);
        removed = true;
      }
    }
    if (!removed) break;
  }
  return points;
}
