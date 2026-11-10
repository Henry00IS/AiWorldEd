import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { generatorRevolveRing, type GeneratorRevolveFrame } from './generator_revolve_brush.js';
import { GENERATOR_REVOLVE_CROSS_CORNERS } from './generator_revolve_cross.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';
import type { GeneratorRevolveBlendShape } from './generator_revolve_blend_shape.js';

/**
 * Signs of the two diagonal tests that bound each arm's wedge: the first bar's
 * +X and -X arms, then the second bar's two arms.
 */
const GENERATOR_REVOLVE_BLEND_CROSS_WEDGES: readonly (readonly [number, number])[] = [
  [1, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
];

/**
 * Returns the direction of a cross's first bar across the axis at one station,
 * from the ends of that bar.
 *
 * @param frame Cross section frame.
 * @param station Station.
 * @returns Unit direction in the horizontal plane, or null at an apex.
 */
export function generatorRevolveBlendCrossDirection(
  frame: GeneratorRevolveFrame,
  station: GeneratorRevolveStation,
): THREE.Vector3 | null {
  const ring = generatorRevolveRing(frame, station);
  const end = ring[0];
  const other = ring[5];
  if (ring.length < GENERATOR_REVOLVE_CROSS_CORNERS || !end || !other) return null;
  const direction = new THREE.Vector3(end.x - other.x, 0, end.z - other.z);
  return direction.lengthSq() > 1e-18 ? direction.normalize() : null;
}

/**
 * Builds one piece of a morph involving a cross. The hulls of the two crossed
 * bars would overlap, so each is kept only inside its own arms' wedges between
 * the vertical diagonal planes: four convex pieces that meet face to face.
 *
 * @param lower Mixed shape at the lower station, two parts.
 * @param upper Mixed shape at the upper station, two parts.
 * @param direction Direction of the first bar across the axis.
 * @param center Axis base.
 * @returns Valid brushes.
 */
export function generatorRevolveBlendCrossPiece(
  lower: GeneratorRevolveBlendShape,
  upper: GeneratorRevolveBlendShape,
  direction: THREE.Vector3,
  center: THREE.Vector3,
): SolidBrush[] {
  const across = new THREE.Vector3(-direction.z, 0, direction.x);
  const diagonals = [direction.clone().sub(across), direction.clone().add(across)];
  return GENERATOR_REVOLVE_BLEND_CROSS_WEDGES.flatMap(([first, second], index) => {
    const bar = index < 2 ? 0 : 1;
    const hull = solidHullBrushFromPoints([...(lower[bar] ?? []), ...(upper[bar] ?? [])]);
    if (!hull) return [];
    const keeps = [
      (diagonals[0] ?? direction).clone().multiplyScalar(first),
      (diagonals[1] ?? direction).clone().multiplyScalar(second),
    ];
    const points = hull.faces.flatMap((face) =>
      keeps.reduce(
        (polygon, keep) => generatorRevolveBlendCrossClip(polygon, keep, center),
        hull.getFaceVertices(face),
      ),
    );
    const piece = solidHullBrushFromPoints(points);
    return piece && SolidBrushValidator.validateGenerated(piece).valid ? [piece] : [];
  });
}

/**
 * Clips a planar polygon to the side of a vertical plane through the axis that
 * a direction points to, keeping exact intersection points so tiny pieces near
 * a point survive.
 *
 * @param polygon Polygon corners in order.
 * @param keep Horizontal direction toward the kept side.
 * @param center Axis base.
 * @returns Clipped polygon corners.
 */
function generatorRevolveBlendCrossClip(
  polygon: readonly THREE.Vector3[],
  keep: THREE.Vector3,
  center: THREE.Vector3,
): THREE.Vector3[] {
  const side = (point: THREE.Vector3) => (point.x - center.x) * keep.x + (point.z - center.z) * keep.z;
  const result: THREE.Vector3[] = [];
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length] ?? point;
    const here = side(point);
    const there = side(next);
    if (here >= 0) result.push(point.clone());
    if (here >= 0 !== there >= 0) result.push(point.clone().lerp(next, here / (here - there)));
  });
  return result;
}
