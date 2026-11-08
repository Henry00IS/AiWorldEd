import * as THREE from 'three';
import type { Curve } from '@/curve/model/curve_model.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';

/**
 * Finds the common ring count for every polygon and square section.
 *
 * @param curve Column profile.
 * @param requested Requested minimum circle resolution.
 * @returns A common multiple of every section's corner count.
 */
export function generatorRevolveCommonSides(curve: Curve | null, requested: number): number {
  const multiple =
    curve?.segments.reduce(
      (count, segment) => {
        const needed =
          segment.section === 'polygon'
            ? (segment.polygonSides ?? 6)
            : segment.section === 'chamfered_square'
              ? 8
              : segment.section
                ? 4
                : 1;
        return (count * needed) / generatorRevolveDivisor(count, needed);
      },
      curve.segments.some((segment) => segment.section) ? 4 : 1,
    ) ?? 1;
  return Math.ceil(requested / multiple) * multiple;
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
 * Returns the section's intrinsic corner count, or the circle resolution.
 *
 * @param section Starting station.
 * @param fallback Round resolution.
 * @returns Corner count whose multiple every ring uses.
 */
export function generatorRevolveSectionCorners(section: GeneratorRevolveStation, fallback: number): number {
  if (section.polygonSides) return section.polygonSides;
  if (section.chamfered) return 8;
  return section.square || section.rounded ? 4 : fallback;
}

/**
 * Samples a section outline at a shared ring index.
 *
 * @param frame Cross-section settings.
 * @param index Index around the ring.
 * @returns Unit-width cross-section point before aspect and rotation.
 */
export function generatorRevolveSectionPoint(frame: GeneratorRevolveFrame, index: number): THREE.Vector2 {
  if (frame.section === 'polygon') return generatorRevolvePolygonPoint(frame.sides, index, frame.polygonSides ?? 6);
  if (frame.section === 'square' || frame.cornerRadius === 0 || frame.chamferAmount === 0)
    return generatorRevolveOutlinePoint(frame.sides, index, [
      new THREE.Vector2(1, 1),
      new THREE.Vector2(-1, 1),
      new THREE.Vector2(-1, -1),
      new THREE.Vector2(1, -1),
    ]);
  if (frame.section === 'chamfered_square') return generatorRevolveChamferPoint(frame, index);
  const angle = ((index + 0.5) * Math.PI * 2) / frame.sides;
  const corner = frame.cornerRadius ?? 1;
  return new THREE.Vector2(
    Math.sign(Math.cos(angle)) * (1 - corner) + Math.cos(angle) * corner,
    Math.sign(Math.sin(angle)) * (1 - corner) + Math.sin(angle) * corner,
  );
}

/**
 * Samples evenly along the flat edges of a regular polygon.
 *
 * @param sides Shared ring count.
 * @param index Ring index.
 * @param corners Polygon corner count.
 * @returns Outline point.
 */
function generatorRevolvePolygonPoint(sides: number, index: number, corners: number): THREE.Vector2 {
  const vertices = Array.from({ length: corners }, (_, at) => {
    const angle = ((at + 0.5) * Math.PI * 2) / corners;
    return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  });
  return generatorRevolveOutlinePoint(sides, index, vertices);
}

/**
 * Samples the eight edges of a square with straight 45-degree corner cuts.
 *
 * @param frame Section settings.
 * @param index Ring index.
 * @returns Outline point.
 */
function generatorRevolveChamferPoint(frame: GeneratorRevolveFrame, index: number): THREE.Vector2 {
  const cut = (frame.chamferAmount ?? 0.3) * (2 - Math.SQRT2);
  const vertices = [
    [1, 1 - cut],
    [1 - cut, 1],
    [-1 + cut, 1],
    [-1, 1 - cut],
    [-1, -1 + cut],
    [-1 + cut, -1],
    [1 - cut, -1],
    [1, -1 + cut],
  ];
  return generatorRevolveOutlinePoint(
    frame.sides,
    index,
    vertices.map(([x, y]) => new THREE.Vector2(x, y)),
  );
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
  const corners = frame.section === 'square' || frame.cornerRadius === 0 ? 4 : (frame.polygonSides ?? frame.sides);
  return 0.5 / roundSides - 0.5 / corners;
}
