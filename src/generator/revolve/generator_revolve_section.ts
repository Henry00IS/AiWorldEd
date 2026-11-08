import * as THREE from 'three';
import type { Curve } from '@/curve/model/curve_model.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';
import {
  generatorRevolveCornerCuts,
  generatorRevolveCornerPoint,
  generatorRevolveSharpVertices,
} from './generator_revolve_corner.js';

/**
 * Finds the common ring count for every polygon and square section: a multiple
 * of every section's corner count, with room for every corner face.
 *
 * @param curve Column profile.
 * @param requested Requested minimum circle resolution.
 * @returns A common multiple of every section's corner count.
 */
export function generatorRevolveCommonSides(curve: Curve | null, requested: number): number {
  const segments = curve?.segments ?? [];
  const multiple = segments.reduce(
    (count, segment) => {
      const needed = segment.section === 'polygon' ? (segment.polygonSides ?? 6) : segment.section ? 4 : 1;
      return (count * needed) / generatorRevolveDivisor(count, needed);
    },
    segments.some((segment) => segment.section) ? 4 : 1,
  );
  const least = Math.max(
    requested,
    ...segments.map((segment) => generatorRevolveCornerRing(segment.section === 'polygon' ? segment : null, segment)),
  );
  return Math.ceil(least / multiple) * multiple;
}

/**
 * Returns the fewest ring points a section needs: one per corner face plus one
 * per side.
 *
 * @param polygon Polygon settings, or null for the square.
 * @param corners Corner settings.
 * @returns Ring points; zero for sharp corners.
 */
function generatorRevolveCornerRing(
  polygon: { polygonSides?: number | undefined } | null,
  corners: { cornerSize?: number | undefined; cornerSides?: number | undefined },
): number {
  if (!corners.cornerSize) return 0;
  return (polygon ? (polygon.polygonSides ?? 6) : 4) * ((corners.cornerSides ?? 1) + 1);
}

/**
 * Finds the greatest common divisor of two positive integers.
 *
 * @param left First integer.
 * @param right Second integer.
 * @returns Greatest common divisor.
 */
function generatorRevolveDivisor(left: number, right: number): number {
  while (right) [left, right] = [right, left % right];
  return left;
}

/**
 * Returns the ring count of one section: the circle resolution rounded up to a
 * multiple of its corner count, with room for every corner face.
 *
 * @param section Starting station.
 * @param fallback Round resolution.
 * @returns Ring point count.
 */
export function generatorRevolveSectionSides(section: GeneratorRevolveStation, fallback: number): number {
  const corners = section.polygonSides ?? (section.square ? 4 : 1);
  const polygon = section.polygonSides ? section : null;
  const least = Math.max(fallback, section.square || polygon ? generatorRevolveCornerRing(polygon, section) : 0);
  return Math.ceil(least / corners) * corners;
}

/** Corner cuts per frame, built once for all rings sharing it. */
const GENERATOR_REVOLVE_CUTS = new WeakMap<GeneratorRevolveFrame, THREE.Vector2[][]>();

/**
 * Samples a section outline at a shared ring index.
 *
 * @param frame Cross-section settings.
 * @param index Index around the ring.
 * @returns Unit-width cross-section point before aspect and rotation.
 */
export function generatorRevolveSectionPoint(frame: GeneratorRevolveFrame, index: number): THREE.Vector2 {
  if (frame.section !== 'square' && frame.section !== 'polygon') {
    const angle = ((index + 0.5) * Math.PI * 2) / frame.sides;
    return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  }
  const vertices = generatorRevolveSharpVertices(frame.section === 'polygon' ? (frame.polygonSides ?? 6) : undefined);
  if (!frame.cornerSize) return generatorRevolveOutlinePoint(frame.sides, index, vertices);
  let cuts = GENERATOR_REVOLVE_CUTS.get(frame);
  if (!cuts) {
    cuts = generatorRevolveCornerCuts(vertices, frame.cornerSize, frame.cornerSides ?? 1);
    GENERATOR_REVOLVE_CUTS.set(frame, cuts);
  }
  return generatorRevolveCornerPoint(cuts, frame.sides, index);
}

/**
 * Distributes equal numbers of samples along each polygon edge.
 *
 * @param sides Shared ring count.
 * @param index Ring index.
 * @param vertices Polygon corners in winding order.
 * @returns Interpolated edge point.
 */
function generatorRevolveOutlinePoint(sides: number, index: number, vertices: readonly THREE.Vector2[]): THREE.Vector2 {
  const along = (index * vertices.length) / sides;
  const corner = Math.floor(along);
  const start = vertices[corner % vertices.length] ?? new THREE.Vector2();
  const end = vertices[(corner + 1) % vertices.length] ?? start;
  return start.clone().lerp(end, along - corner);
}
/**
 * Drops interior samples along a straight outline edge.
 *
 * @param ring Shared-count ring points.
 * @returns True corners of the polygon outline.
 */
export function generatorRevolveOutlineSimplify(ring: readonly THREE.Vector3[]): THREE.Vector3[] {
  return ring.filter((point, index) => {
    const before = ring[(index + ring.length - 1) % ring.length] ?? point;
    const after = ring[(index + 1) % ring.length] ?? point;
    const incoming = point.clone().sub(before);
    const outgoing = after.clone().sub(point);
    return incoming.cross(outgoing).lengthSq() > 1e-20;
  });
}

/**
 * Aligns the material seam of flat sections with the round-ring seam.
 *
 * @param frame Section frame.
 * @param roundSides Shared circle resolution.
 * @returns Offset in perimeter turns.
 */
export function generatorRevolveSectionPhase(frame: GeneratorRevolveFrame, roundSides: number): number {
  const sharp = frame.section === 'square' ? 4 : (frame.polygonSides ?? frame.sides);
  const corners = frame.cornerSize ? frame.sides : sharp;
  return 0.5 / roundSides - 0.5 / corners;
}
