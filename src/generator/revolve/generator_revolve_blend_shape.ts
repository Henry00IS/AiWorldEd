import * as THREE from 'three';
import { generatorRevolveRing, type GeneratorRevolveFrame } from './generator_revolve_brush.js';
import { GENERATOR_REVOLVE_CROSS_CORNERS } from './generator_revolve_cross.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';

/**
 * A cross-section ring as convex parts at one height: one part for convex
 * sections, the two crossed bars of a cross.
 */
export type GeneratorRevolveBlendShape = THREE.Vector3[][];

/** Ring corners of the two crossed bars a cross outline is the union of. */
const GENERATOR_REVOLVE_BLEND_CROSS_BARS: readonly (readonly number[])[] = [
  [0, 5, 6, 11],
  [2, 3, 8, 9],
];

/** Smallest distance between two outline points that keeps both, in metres. */
const GENERATOR_REVOLVE_BLEND_HULL_EPSILON = 1e-9;

/**
 * Builds the convex parts of one station's ring in a section frame. A cross is
 * split into its two crossed bars, so morphing it with another section keeps
 * every piece convex; an apex is one point per part.
 *
 * @param frame Section frame.
 * @param station Station.
 * @returns Convex parts.
 */
export function generatorRevolveBlendShapeOf(
  frame: GeneratorRevolveFrame,
  station: GeneratorRevolveStation,
): GeneratorRevolveBlendShape {
  const ring = generatorRevolveRing(frame, station);
  if (frame.section !== 'cross') return [ring];
  if (ring.length < GENERATOR_REVOLVE_CROSS_CORNERS)
    return GENERATOR_REVOLVE_BLEND_CROSS_BARS.map(() => ring.slice(0, 1));
  return GENERATOR_REVOLVE_BLEND_CROSS_BARS.map((bar) =>
    bar.map((corner) => (ring[corner] ?? new THREE.Vector3()).clone()),
  );
}

/**
 * Scales a shape about the axis and moves it to another height, so a joint
 * outline follows the profile along a morphing segment.
 *
 * @param shape Shape.
 * @param center Axis base.
 * @param factor Scale across the axis.
 * @param y World height of the result.
 * @returns Scaled shape.
 */
export function generatorRevolveBlendShapeScale(
  shape: GeneratorRevolveBlendShape,
  center: THREE.Vector3,
  factor: number,
  y: number,
): GeneratorRevolveBlendShape {
  return shape.map((part) =>
    part.map(
      (point) =>
        new THREE.Vector3(center.x + (point.x - center.x) * factor, y, center.z + (point.z - center.z) * factor),
    ),
  );
}

/**
 * Mixes two shapes as the weighted Minkowski sum of their outlines about the
 * axis, the exact cross-section of the convex hull between them. Parts pair up
 * one to one when both have as many, or every part meets the other single
 * part.
 *
 * @param lower First shape.
 * @param upper Second shape.
 * @param weight Share of the second shape, 0 to 1.
 * @param center Axis base.
 * @param y World height of the result.
 * @returns Mixed convex parts.
 */
export function generatorRevolveBlendShapeMix(
  lower: GeneratorRevolveBlendShape,
  upper: GeneratorRevolveBlendShape,
  weight: number,
  center: THREE.Vector3,
  y: number,
): GeneratorRevolveBlendShape {
  const count = Math.max(lower.length, upper.length);
  return Array.from({ length: count }, (_, index) => {
    const first = lower[lower.length === count ? index : 0] ?? [];
    const second = upper[upper.length === count ? index : 0] ?? [];
    return generatorRevolveBlendPartMix(first, second, weight, center, y);
  });
}

/**
 * Mixes two convex outlines: every weighted pair sum about the axis, reduced to
 * its convex hull.
 *
 * @param first First outline.
 * @param second Second outline.
 * @param weight Share of the second outline.
 * @param center Axis base.
 * @param y World height of the result.
 * @returns Convex outline.
 */
function generatorRevolveBlendPartMix(
  first: readonly THREE.Vector3[],
  second: readonly THREE.Vector3[],
  weight: number,
  center: THREE.Vector3,
  y: number,
): THREE.Vector3[] {
  const sums: THREE.Vector2[] = [];
  for (const a of first)
    for (const b of second)
      sums.push(
        new THREE.Vector2(
          (a.x - center.x) * (1 - weight) + (b.x - center.x) * weight,
          (a.z - center.z) * (1 - weight) + (b.z - center.z) * weight,
        ),
      );
  return generatorRevolveBlendHull2d(sums).map((point) => new THREE.Vector3(center.x + point.x, y, center.z + point.y));
}

/**
 * Returns the convex hull of points in a plane, counter-clockwise, without
 * points on its edges.
 *
 * @param points Points.
 * @returns Hull corners; fewer than three for collinear input.
 */
export function generatorRevolveBlendHull2d(points: readonly THREE.Vector2[]): THREE.Vector2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter(
    (point, index) =>
      index === 0 || point.distanceTo(sorted[index - 1] ?? point) > GENERATOR_REVOLVE_BLEND_HULL_EPSILON,
  );
  if (unique.length < 3) return unique;
  const lower = generatorRevolveBlendHullChain(unique);
  const upper = generatorRevolveBlendHullChain([...unique].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Builds one half of a monotone-chain hull.
 *
 * @param points Points sorted along the sweep.
 * @returns Chain from the first to the last point, turning left.
 */
function generatorRevolveBlendHullChain(points: readonly THREE.Vector2[]): THREE.Vector2[] {
  const chain: THREE.Vector2[] = [];
  for (const point of points) {
    while (
      chain.length >= 2 &&
      generatorRevolveBlendTurn(chain[chain.length - 2], chain[chain.length - 1], point) <= 1e-18
    )
      chain.pop();
    chain.push(point);
  }
  return chain;
}

/**
 * Returns the turn of three points: positive when they turn left.
 *
 * @param a First point.
 * @param b Second point.
 * @param c Third point.
 * @returns Cross product of the two steps.
 */
function generatorRevolveBlendTurn(
  a: THREE.Vector2 | undefined,
  b: THREE.Vector2 | undefined,
  c: THREE.Vector2,
): number {
  if (!a || !b) return 1;
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
