import * as THREE from 'three';

/** Flight measurements a slab profile needs. */
export interface ModifierStackStairsSlabFlight {
  /** Step count. */
  steps: number;
  /** Height of one step. */
  rise: number;
  /** Depth of one regular step. */
  run: number;
  /** Total run including the top landing. */
  length: number;
}

/**
 * Returns the convex side profile of one step of a sloped-slab flight, as (run
 * distance, height) points. The underside runs parallel to the pitch, never
 * drops below the floor, and stays flat under the top landing.
 *
 * @param index Step index from the bottom.
 * @param flight Flight measurements.
 * @param waist Slab thickness square to the pitch.
 * @param floor Floor height.
 * @returns Convex polygon, counter-clockwise.
 */
export function modifierStackStairsSlabProfile(
  index: number,
  flight: ModifierStackStairsSlabFlight,
  waist: number,
  floor: number,
  recess = 0,
): THREE.Vector2[] {
  const last = index === flight.steps - 1;
  const landing = last && flight.length > flight.steps * flight.run;
  const start = index * flight.run + recess;
  const end = last ? flight.length : (index + 1) * flight.run + recess;
  const top = floor + (index + 1) * flight.rise;
  const slope = flight.run > 0 ? flight.rise / flight.run : 0;
  const drop = waist * Math.sqrt(1 + slope * slope);
  const underside = (along: number): number => floor + ((landing ? start : along) - recess) * slope - drop;
  const rectangle = [
    new THREE.Vector2(start, floor),
    new THREE.Vector2(end, floor),
    new THREE.Vector2(end, top),
    new THREE.Vector2(start, top),
  ];
  return modifierStackStairsClipAbove(rectangle, underside);
}

/**
 * Keeps the part of a convex polygon on or above a line.
 *
 * @param polygon Convex polygon.
 * @param line Height of the line at a run distance; must be linear.
 * @returns Clipped convex polygon.
 */
export function modifierStackStairsClipAbove(
  polygon: readonly THREE.Vector2[],
  line: (along: number) => number,
): THREE.Vector2[] {
  const output: THREE.Vector2[] = [];
  const side = (point: THREE.Vector2): number => point.y - line(point.x);
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length] ?? current;
    const a = side(current);
    const b = side(next);
    if (a >= 0) output.push(current.clone());
    if ((a > 0 && b < 0) || (a < 0 && b > 0)) output.push(current.clone().lerp(next, a / (a - b)));
  });
  return output;
}
