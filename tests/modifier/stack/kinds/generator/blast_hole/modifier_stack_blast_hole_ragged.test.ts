import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blastHoleRaggedShape } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_ragged.js';
import type { BlastHoleRaggedSettings } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_ragged_depth.js';
import { BLAST_HOLE_RAGGED_MARGIN } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_ragged_outline.js';
import { blastHolePolygonSimple } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_simple.js';
import {
  BLAST_HOLE_MIN_ANGLE,
  BLAST_HOLE_MIN_EDGE,
  BLAST_HOLE_MIN_THICKNESS,
  blastHolePolygonArea,
  blastHolePolygonContains,
  blastHolePolygonMinAngle,
  blastHolePolygonMinEdge,
  blastHolePolygonWidth,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_quality.js';

/**
 * Returns Jagged settings for a seed with the inspector defaults.
 *
 * @param seed Seed.
 * @param patch Settings to change.
 * @returns Settings.
 */
function jagged(seed: number, patch: Partial<BlastHoleRaggedSettings> = {}): BlastHoleRaggedSettings {
  return { seed, shape: 0.8, jagSize: 0.3, roughness: 0.5, bites: 3, detail: 1, ...patch };
}

/**
 * Settings and half sizes swept by the bound tests: defaults, extremes, wide,
 * tall and tiny.
 */
const SWEEP: { patch: Partial<BlastHoleRaggedSettings>; half: [number, number] }[] = [
  { patch: {}, half: [1.5, 1.5] },
  { patch: { shape: 0, roughness: 1, bites: 12, detail: 3 }, half: [1.5, 1.5] },
  { patch: { shape: 1, roughness: 0, bites: 0, detail: 0 }, half: [1, 2] },
  { patch: { roughness: 1, detail: 2 }, half: [6, 1.5] },
  { patch: { jagSize: 0.05, detail: 3 }, half: [0.8, 0.5] },
  { patch: { jagSize: 3, roughness: 1, bites: 6 }, half: [0.15, 0.15] },
];

/**
 * Returns whether a convex polygon turns left at every corner.
 *
 * @param polygon Polygon.
 * @returns True when strictly convex and counter-clockwise.
 */
function convex(polygon: readonly THREE.Vector2[]): boolean {
  return polygon.every((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const next = polygon[(index + 1) % polygon.length]!;
    return (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x) > 0;
  });
}

/**
 * Returns the inward corners (the valleys between teeth) per metre of outline:
 * how densely it is jagged.
 *
 * @param outline Counter-clockwise outline.
 * @returns Valleys per metre.
 */
function valleysPerMetre(outline: readonly THREE.Vector2[]): number {
  const length = outline.reduce(
    (sum, point, index) => sum + point.distanceTo(outline[(index + 1) % outline.length]!),
    0,
  );
  const valleys = outline.filter((point, index) => {
    const previous = outline[(index + outline.length - 1) % outline.length]!;
    const next = outline[(index + 1) % outline.length]!;
    return (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x) < 0;
  }).length;
  return valleys / length;
}

/**
 * Returns how deep the outline cuts in along the box top, as the mean gap
 * between the top margin and the outline points near the top, in metres.
 *
 * @param outline Outline.
 * @param halfWidth Half box width.
 * @param halfHeight Half box height.
 * @returns Mean depth.
 */
function meanTopDepth(outline: readonly THREE.Vector2[], halfWidth: number, halfHeight: number): number {
  const top = halfHeight - BLAST_HOLE_RAGGED_MARGIN;
  const near = outline.filter((point) => point.y > 0.3 * halfHeight && Math.abs(point.x) < halfWidth - 0.6);
  return near.reduce((sum, point) => sum + (top - point.y), 0) / Math.max(1, near.length);
}

describe('blast hole jagged outline', () => {
  it('is a simple outline inside the box, keeping the margin, across settings and seeds', () => {
    for (const { patch, half } of SWEEP)
      for (let seed = 0; seed < 25; seed++) {
        const shape = blastHoleRaggedShape(jagged(seed, patch), half[0], half[1]);
        if (!shape) throw new Error(`seed ${seed} ${JSON.stringify(patch)} gave no shape`);
        expect(blastHolePolygonSimple(shape.outline)).toBe(true);
        expect(blastHolePolygonArea(shape.outline)).toBeGreaterThan(0);
        for (const point of shape.outline) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(half[0] - BLAST_HOLE_RAGGED_MARGIN + 1e-9);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(half[1] - BLAST_HOLE_RAGGED_MARGIN + 1e-9);
        }
      }
  }, 60_000);

  it('tiles the outline with sound convex parts: no sliver, short edge or needle', () => {
    for (const { patch, half } of SWEEP)
      for (let seed = 0; seed < 25; seed++) {
        const shape = blastHoleRaggedShape(jagged(seed, patch), half[0], half[1])!;
        const total = shape.parts.reduce((sum, part) => sum + blastHolePolygonArea(part), 0);
        expect(total).toBeCloseTo(blastHolePolygonArea(shape.outline), 9);
        for (const part of shape.parts) {
          expect(convex(part)).toBe(true);
          expect(blastHolePolygonWidth(part)).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_THICKNESS - 1e-9);
          expect(blastHolePolygonMinEdge(part)).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_EDGE - 1e-9);
          expect(blastHolePolygonMinAngle(part)).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_ANGLE - 1e-9);
        }
      }
  }, 60_000);

  it('covers every point of the outline with exactly one part', () => {
    for (let seed = 0; seed < 10; seed++) {
      const shape = blastHoleRaggedShape(jagged(seed, { detail: 2 }), 1.5, 1.2)!;
      for (let i = 0; i < 900; i++) {
        const point = new THREE.Vector2(
          (((i % 30) + 0.37) / 30) * 3 - 1.5,
          ((Math.floor(i / 30) + 0.61) / 30) * 2.4 - 1.2,
        );
        const owners = shape.parts.filter((part) => blastHolePolygonContains(part, point)).length;
        expect(owners).toBe(blastHolePolygonContains(shape.outline, point) ? 1 : 0);
      }
    }
  }, 60_000);

  it('keeps the jag size in metres: a four times wider wall gets more jags, not wider or deeper ones', () => {
    const stats = { squareValleys: 0, wideValleys: 0, squareDepth: 0, wideDepth: 0 };
    for (let seed = 0; seed < 12; seed++) {
      const square = blastHoleRaggedShape(jagged(seed, { bites: 0 }), 1.5, 1.5)!.outline;
      const wide = blastHoleRaggedShape(jagged(seed, { bites: 0 }), 6, 1.5)!.outline;
      expect(wide.length).toBeGreaterThan(square.length * 2);
      stats.squareValleys += valleysPerMetre(square);
      stats.wideValleys += valleysPerMetre(wide);
      stats.squareDepth += meanTopDepth(square, 1.5, 1.5);
      stats.wideDepth += meanTopDepth(wide, 6, 1.5);
    }
    expect(stats.wideValleys / stats.squareValleys).toBeGreaterThan(0.8);
    expect(stats.wideValleys / stats.squareValleys).toBeLessThan(1.25);
    expect(stats.wideDepth / stats.squareDepth).toBeGreaterThan(0.75);
    expect(stats.wideDepth / stats.squareDepth).toBeLessThan(1.33);
  }, 60_000);

  it('builds the same shape for the same seed and another for another seed', () => {
    expect(blastHoleRaggedShape(jagged(7), 1.5, 1.5)).toEqual(blastHoleRaggedShape(jagged(7), 1.5, 1.5));
    expect(blastHoleRaggedShape(jagged(7), 1.5, 1.5)?.outline).not.toEqual(
      blastHoleRaggedShape(jagged(8), 1.5, 1.5)?.outline,
    );
  }, 60_000);

  it('spans a circle at Shape 0 to a rectangle at Shape 1', () => {
    const smooth = { roughness: 0, bites: 0, detail: 0, jagSize: 0.05 };
    const fill = (shapeValue: number) =>
      blastHolePolygonArea(blastHoleRaggedShape(jagged(3, { ...smooth, shape: shapeValue }), 1.5, 1.5)!.outline) /
      (2 * (1.5 - BLAST_HOLE_RAGGED_MARGIN)) ** 2;
    expect(fill(0)).toBeGreaterThan(Math.PI / 4 - 0.06);
    expect(fill(0)).toBeLessThan(Math.PI / 4 + 0.01);
    expect(fill(1)).toBeGreaterThan(0.93);
    expect(fill(0.5)).toBeGreaterThan(fill(0));
    expect(fill(1)).toBeGreaterThan(fill(0.5));
    const circle = blastHoleRaggedShape(jagged(3, { ...smooth, shape: 0 }), 1.5, 1.5)!.outline;
    const radii = circle.map((point) => point.length());
    expect(Math.max(...radii) / Math.min(...radii)).toBeLessThan(1.05);
  }, 60_000);

  it('keeps the corners of a long wall round at Shape 0 without stretching them into an ellipse', () => {
    const smooth = { roughness: 0, bites: 0, detail: 0, jagSize: 0.05, shape: 0 };
    const outline = blastHoleRaggedShape(jagged(3, smooth), 6, 1.5)!.outline;
    const flatTop = outline.filter((point) => Math.abs(point.x) < 4 && point.y > 0);
    for (const point of flatTop) expect(point.y).toBeGreaterThan(1.5 - BLAST_HOLE_RAGGED_MARGIN - 0.03);
  }, 60_000);
});
