import * as THREE from 'three';
import { CURVE_CROSS_ARM_DEFAULT, CURVE_STADIUM_STRAIGHT_DEFAULT } from '@/curve/model/curve_section.js';
import { generatorRevolveStadiumCorners, generatorRevolveStadiumVertices } from './generator_revolve_stadium.js';
import {
  GENERATOR_REVOLVE_BAR_CORNERS,
  GENERATOR_REVOLVE_CROSS_CORNERS,
  generatorRevolveBarVertices,
  generatorRevolveCrossVertices,
} from './generator_revolve_cross.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';
import {
  generatorRevolveCornerCuts,
  generatorRevolveCornerPoint,
  generatorRevolveSharpVertices,
} from './generator_revolve_corner.js';

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
 * Returns a section's natural outline count, independent of other sections.
 * Only round sections use the requested circle resolution.
 *
 * @param section Starting station.
 * @param fallback Round resolution.
 * @returns Ring point count.
 */
export function generatorRevolveSectionSides(section: GeneratorRevolveStation, fallback: number): number {
  if (section.crossArm) return GENERATOR_REVOLVE_CROSS_CORNERS;
  if (section.barThickness) return GENERATOR_REVOLVE_BAR_CORNERS;
  if (section.stadiumStraight) return generatorRevolveStadiumCorners(fallback);
  if (!section.square && !section.polygonSides) return fallback;
  const corners = section.polygonSides ?? 4;
  return generatorRevolveCornerRing(section.polygonSides ? section : null, section) || corners;
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
  if (frame.section === 'stadium')
    return generatorRevolveOutlinePoint(
      frame.sides,
      index,
      generatorRevolveStadiumVertices(frame.straight ?? CURVE_STADIUM_STRAIGHT_DEFAULT, frame.sides),
    );
  if (frame.section === 'bar')
    return generatorRevolveOutlinePoint(
      frame.sides,
      index,
      generatorRevolveBarVertices(frame.armWidth ?? CURVE_CROSS_ARM_DEFAULT, frame.aspect ?? 1),
    );
  if (frame.section === 'cross')
    return generatorRevolveOutlinePoint(
      frame.sides,
      index,
      generatorRevolveCrossVertices(frame.armWidth ?? CURVE_CROSS_ARM_DEFAULT, frame.aspect ?? 1),
    );
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
  if (ring.length < 3) return [...ring];
  const corners = generatorRevolveOutlineCorners(ring);
  return corners.length > 0 ? corners : generatorRevolveOutlineEnds(ring);
}

/**
 * Keeps the points where a closed outline turns.
 *
 * @param ring Ring points.
 * @returns Turning points; none for an outline flattened onto a line.
 */
function generatorRevolveOutlineCorners(ring: readonly THREE.Vector3[]): THREE.Vector3[] {
  return ring.filter((point, index) => {
    const before = ring[(index + ring.length - 1) % ring.length] ?? point;
    const after = ring[(index + 1) % ring.length] ?? point;
    const incoming = point.clone().sub(before);
    const outgoing = after.clone().sub(point);
    return incoming.cross(outgoing).lengthSq() > 1e-20;
  });
}

/**
 * Returns the two ends of an outline flattened onto a line, such as the ridge
 * of a fixed-depth section with no width.
 *
 * @param ring Ring points.
 * @returns Farthest pair of points, or the first point when all coincide.
 */
function generatorRevolveOutlineEnds(ring: readonly THREE.Vector3[]): THREE.Vector3[] {
  const first = ring[0];
  if (!first) return [];
  const far = ring.reduce((best, point) =>
    point.distanceToSquared(first) > best.distanceToSquared(first) ? point : best,
  );
  const other = ring.reduce((best, point) =>
    point.distanceToSquared(far) > best.distanceToSquared(far) ? point : best,
  );
  return far.distanceToSquared(other) > 1e-20 ? [far, other] : [first];
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
