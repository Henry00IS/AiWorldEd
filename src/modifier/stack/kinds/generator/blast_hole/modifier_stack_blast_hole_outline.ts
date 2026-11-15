import * as THREE from 'three';
import { modifierStackRandomValue } from '@/modifier/stack/kinds/array/modifier_stack_array_random.js';
import {
  BLAST_HOLE_MIN_EDGE,
  blastHolePolygonArea,
  blastHolePolygonSound,
} from './modifier_stack_blast_hole_quality.js';

/**
 * Settings of the star-shaped outline the Bricks style knocks whole bricks out
 * of. (Jagged has its own ragged outline; see
 * modifier_stack_blast_hole_ragged.)
 */
export interface BlastHoleOutlineSettings {
  /** Random seed. */
  seed: number;
  /** Number of spikes around the hole. */
  spikes: number;
  /** How deep the notches between spikes cut in, 0 to 0.85 of the radius. */
  spikeLength: number;
  /** How uneven the spikes and edges are, 0 to 1. */
  roughness: number;
  /** Extra jagged points along every spike edge, 0 to 3. */
  detail: number;
}

/** Fewest spikes; fewer would no longer read as a blast. */
export const BLAST_HOLE_MIN_SPIKES = 3;

/** Most spikes. */
export const BLAST_HOLE_MAX_SPIKES = 24;

/** Most edge detail points per spike edge. */
export const BLAST_HOLE_MAX_DETAIL = 3;

/** Deepest notch, as a share of the radius, so the core never closes up. */
export const BLAST_HOLE_MAX_SPIKE_LENGTH = 0.85;

/** Smallest radius of any outline point, as a share of the full radius. */
const BLAST_HOLE_MIN_RADIUS = 0.12;

/** Random channels. */
const BLAST_HOLE_CHANNEL = { phase: 1, tipAngle: 2, tipRadius: 3, valleyAngle: 4, valleyRadius: 5, detail: 6 } as const;

/** One outline point around the centre. */
interface BlastHolePolar {
  angle: number;
  radius: number;
}

/**
 * Returns a deterministic value in [0, 1) for one outline point and channel.
 *
 * @param seed Seed.
 * @param index Point index.
 * @param channel Channel.
 * @returns Uniform value.
 */
function blastHoleRandom(seed: number, index: number, channel: number): number {
  return modifierStackRandomValue(seed, 0x6b1a57, index, channel);
}

/**
 * Builds the outline around the centre as points at strictly increasing angles,
 * so the outline is star-shaped from the centre: spike tips and the notches
 * between them, with optional jagged points along each edge.
 *
 * @param settings Outline settings.
 * @returns Polar points, angles increasing within one turn.
 */
function blastHolePolarOutline(settings: BlastHoleOutlineSettings): BlastHolePolar[] {
  const { seed, roughness } = settings;
  const spikes = Math.round(THREE.MathUtils.clamp(settings.spikes, BLAST_HOLE_MIN_SPIKES, BLAST_HOLE_MAX_SPIKES));
  const notch = THREE.MathUtils.clamp(settings.spikeLength, 0, BLAST_HOLE_MAX_SPIKE_LENGTH);
  const detail = Math.round(THREE.MathUtils.clamp(settings.detail, 0, BLAST_HOLE_MAX_DETAIL));
  const step = (Math.PI * 2) / spikes;
  const phase = blastHoleRandom(seed, 0, BLAST_HOLE_CHANNEL.phase) * Math.PI * 2;
  const keys: BlastHolePolar[] = [];
  for (let spike = 0; spike < spikes; spike++) {
    const tipShift = (blastHoleRandom(seed, spike, BLAST_HOLE_CHANNEL.tipAngle) - 0.5) * 0.5 * roughness;
    const tipRadius = 1 - 0.3 * roughness * blastHoleRandom(seed, spike, BLAST_HOLE_CHANNEL.tipRadius);
    const valleyShift = (blastHoleRandom(seed, spike, BLAST_HOLE_CHANNEL.valleyAngle) - 0.5) * 0.4 * roughness;
    const valleyRandom = blastHoleRandom(seed, spike, BLAST_HOLE_CHANNEL.valleyRadius);
    const valleyRadius = Math.max(BLAST_HOLE_MIN_RADIUS, (1 - notch) * (1 - 0.4 * roughness * valleyRandom));
    keys.push({ angle: phase + (spike + tipShift) * step, radius: tipRadius });
    keys.push({ angle: phase + (spike + 0.5 + valleyShift) * step, radius: Math.min(tipRadius, valleyRadius) });
  }
  if (detail === 0) return keys;
  const points: BlastHolePolar[] = [];
  keys.forEach((key, index) => {
    const next = keys[(index + 1) % keys.length]!;
    const nextAngle = index + 1 === keys.length ? next.angle + Math.PI * 2 : next.angle;
    points.push(key);
    for (let part = 1; part <= detail; part++) {
      const t = part / (detail + 1);
      const wobble = (blastHoleRandom(seed, index * 8 + part, BLAST_HOLE_CHANNEL.detail) - 0.5) * 0.5 * roughness;
      const radius = THREE.MathUtils.lerp(key.radius, next.radius, t) * (1 + wobble * 0.5);
      points.push({
        angle: THREE.MathUtils.lerp(key.angle, nextAngle, t),
        radius: THREE.MathUtils.clamp(radius, BLAST_HOLE_MIN_RADIUS, 1),
      });
    }
  });
  return points;
}

/**
 * Removes outline points that would make short edges or flat corners: points
 * closer than the shortest edge to the previous one, and points that barely
 * turn the outline. Removing a point keeps the outline star-shaped.
 *
 * @param outline Outline, counter-clockwise.
 * @returns Cleaned outline.
 */
function blastHoleOutlineClean(outline: THREE.Vector2[]): THREE.Vector2[] {
  let points = outline;
  for (let pass = 0; pass < 8; pass++) {
    const kept = points.filter((point, index) => {
      const previous = points[(index + points.length - 1) % points.length]!;
      const next = points[(index + 1) % points.length]!;
      if (point.distanceTo(previous) < BLAST_HOLE_MIN_EDGE * 2 && index > 0) return false;
      const a = point.clone().sub(previous);
      const b = next.clone().sub(point);
      const turn = Math.abs(a.x * b.y - a.y * b.x) / Math.max(1e-12, a.length() * b.length());
      return turn > Math.sin(THREE.MathUtils.degToRad(2));
    });
    if (kept.length === points.length || kept.length < 3) return kept.length < 3 ? points : kept;
    points = kept;
  }
  return points;
}

/**
 * Builds the hole outline in metres around the centre of the hole, counter-
 * clockwise and star-shaped from the centre, inside the ellipse that fits the
 * given half sizes.
 *
 * @param settings Outline settings.
 * @param halfWidth Half the hole width.
 * @param halfHeight Half the hole height.
 * @returns Outline points.
 */
export function blastHoleOutline(
  settings: BlastHoleOutlineSettings,
  halfWidth: number,
  halfHeight: number,
): THREE.Vector2[] {
  const outline = blastHolePolarOutline(settings).map(
    (point) =>
      new THREE.Vector2(
        Math.cos(point.angle) * point.radius * halfWidth,
        Math.sin(point.angle) * point.radius * halfHeight,
      ),
  );
  return blastHoleOutlineClean(outline);
}

/**
 * Returns whether the corner turns left strictly enough to count as convex.
 *
 * @param a Previous point.
 * @param b Corner.
 * @param c Next point.
 * @returns True for a clear left turn.
 */
function blastHoleTurnsLeft(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): boolean {
  const ab = b.clone().sub(a);
  const bc = c.clone().sub(b);
  return (ab.x * bc.y - ab.y * bc.x) / Math.max(1e-12, ab.length() * bc.length()) > 1e-3;
}

/**
 * Returns whether a polygon is strictly convex and counter-clockwise.
 *
 * @param polygon Polygon.
 * @returns True when convex.
 */
function blastHoleConvex(polygon: readonly THREE.Vector2[]): boolean {
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[(index + polygon.length - 1) % polygon.length]!;
    const b = polygon[index]!;
    const c = polygon[(index + 1) % polygon.length]!;
    if (!blastHoleTurnsLeft(a, b, c)) return false;
  }
  return true;
}

/**
 * Splits a star-shaped outline into convex parts that tile it exactly: a fan of
 * triangles from the centre, each run of neighbours merged while the merged
 * part stays convex. Parts share their vertices, so there are no gaps or
 * overlaps.
 *
 * @param outline Counter-clockwise outline, star-shaped from the origin.
 * @returns Convex parts, counter-clockwise; null when a fan triangle is not
 *   convex.
 */
export function blastHoleFanParts(outline: readonly THREE.Vector2[]): THREE.Vector2[][] | null {
  const center = new THREE.Vector2();
  const count = outline.length;
  const start = blastHoleFanStart(outline);
  const parts: THREE.Vector2[][] = [];
  let part: THREE.Vector2[] = [center, outline[start]!];
  for (let step = 1; step <= count; step++) {
    const point = outline[(start + step) % count]!;
    const grown = [...part, point];
    if (part.length >= 3 && !blastHoleConvex(grown)) {
      parts.push(part);
      part = [center, part[part.length - 1]!, point];
    } else part = grown;
    if (part.length === 3 && !blastHoleConvex(part)) return null;
  }
  parts.push(part);
  return parts.every((candidate) => blastHolePolygonArea(candidate) > 0) ? parts : null;
}

/**
 * Picks the fan start: the outline point nearest the centre, so merged parts
 * tend to hold a whole spike.
 *
 * @param outline Outline.
 * @returns Start index.
 */
function blastHoleFanStart(outline: readonly THREE.Vector2[]): number {
  let best = 0;
  outline.forEach((point, index) => {
    if (point.lengthSq() < outline[best]!.lengthSq()) best = index;
  });
  return best;
}

/** One outline and the convex parts that tile it. */
export interface BlastHoleShape {
  /** Outline, counter-clockwise, in metres around the hole centre. */
  outline: THREE.Vector2[];
  /** Convex parts tiling the outline exactly. */
  parts: THREE.Vector2[][];
}

/**
 * Builds a sound hole shape: the outline the settings ask for, or, when one of
 * its convex parts would be thinner or sharper than CSG likes, the closest
 * simpler outline that is not, by lowering the detail, then the spike count,
 * then the notch depth. Every part meets the bounds in `blastHolePolygonSound`;
 * nothing is dropped, so the hole stays whole.
 *
 * @param settings Outline settings.
 * @param halfWidth Half the hole width.
 * @param halfHeight Half the hole height.
 * @returns Shape, or null when even a plain octagon is too small.
 */
export function blastHoleShape(
  settings: BlastHoleOutlineSettings,
  halfWidth: number,
  halfHeight: number,
): BlastHoleShape | null {
  for (const attempt of blastHoleAttempts(settings)) {
    const outline = blastHoleOutline(attempt, halfWidth, halfHeight);
    const parts = blastHoleFanParts(outline);
    if (parts && parts.every(blastHolePolygonSound)) return { outline, parts };
  }
  const octagon = Array.from({ length: 8 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * halfWidth, Math.sin(angle) * halfHeight);
  });
  return blastHolePolygonSound(octagon) ? { outline: octagon, parts: [octagon] } : null;
}

/**
 * Lists the settings to try, from the asked-for ones to ever simpler ones.
 *
 * @param settings Asked-for settings.
 * @returns Attempts in order.
 */
function blastHoleAttempts(settings: BlastHoleOutlineSettings): BlastHoleOutlineSettings[] {
  const attempts: BlastHoleOutlineSettings[] = [];
  const spikes = Math.round(THREE.MathUtils.clamp(settings.spikes, BLAST_HOLE_MIN_SPIKES, BLAST_HOLE_MAX_SPIKES));
  for (let detail = Math.round(THREE.MathUtils.clamp(settings.detail, 0, BLAST_HOLE_MAX_DETAIL)); detail >= 0; detail--)
    attempts.push({ ...settings, spikes, detail });
  for (let fewer = spikes - 1; fewer >= BLAST_HOLE_MIN_SPIKES; fewer--)
    attempts.push({ ...settings, spikes: fewer, detail: 0 });
  for (let notch = settings.spikeLength * 0.7; notch > 0.05; notch *= 0.7)
    attempts.push({ ...settings, spikes: BLAST_HOLE_MIN_SPIKES, detail: 0, spikeLength: notch });
  return attempts;
}
