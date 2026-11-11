import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';

/** Corner count of a cross outline: three per arm. */
export const GENERATOR_REVOLVE_CROSS_CORNERS = 12;

/** Corner count of a bar outline. */
export const GENERATOR_REVOLVE_BAR_CORNERS = 4;

/**
 * Returns the half-thickness of a bar or cross arm in outline units across X
 * and across Z, so the thickness is the same both ways after aspect scaling.
 *
 * @param armWidth Thickness as a fraction of the section width.
 * @param aspect Depth divided by width.
 * @returns Half-thickness across X, then across Z before aspect scaling.
 */
function generatorRevolveArmHalf(armWidth: number, aspect: number): [number, number] {
  const half = armWidth * Math.min(1, aspect);
  return [half, half / aspect];
}

/**
 * Returns the four corners of a bar outline in winding order: one flat bar
 * along X, the single-arm counterpart of the cross.
 *
 * @param armWidth Thickness as a fraction of the section width.
 * @param aspect Depth divided by width.
 * @returns Outline corners before aspect scaling.
 */
export function generatorRevolveBarVertices(armWidth: number, aspect: number): THREE.Vector2[] {
  const across = generatorRevolveArmHalf(armWidth, aspect)[1];
  return [
    new THREE.Vector2(1, across),
    new THREE.Vector2(-1, across),
    new THREE.Vector2(-1, -across),
    new THREE.Vector2(1, -across),
  ];
}

/**
 * Ring corners of the five convex pieces of a cross: the centre square and the
 * four arms, each arm ending flush on one side of the centre so every outer
 * face belongs to exactly one outline edge.
 */
const GENERATOR_REVOLVE_CROSS_PIECES: readonly (readonly number[])[] = [
  [1, 4, 7, 10],
  [10, 11, 0, 1],
  [1, 2, 3, 4],
  [4, 5, 6, 7],
  [7, 8, 9, 10],
];

/**
 * Returns the twelve corners of a cross outline in winding order, starting at
 * the first corner past the +X axis. Both arms keep the same thickness after
 * the depth is scaled by the aspect.
 *
 * @param armWidth Arm thickness as a fraction of the section width.
 * @param aspect Depth divided by width.
 * @returns Outline corners before aspect scaling.
 */
export function generatorRevolveCrossVertices(armWidth: number, aspect: number): THREE.Vector2[] {
  const [half, across] = generatorRevolveArmHalf(armWidth, aspect);
  return [
    [1, across],
    [half, across],
    [half, 1],
    [-half, 1],
    [-half, across],
    [-1, across],
    [-1, -across],
    [-half, -across],
    [-half, -1],
    [half, -1],
    [half, -across],
    [1, -across],
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

/**
 * Builds the convex pieces of one cross run from its rings. Each piece is the
 * hull of its corners on every ring, so tapers, merged concave runs and twist
 * follow the same rules as the other sections; any overlap stays inside the
 * centre piece.
 *
 * @param rings Cross rings bottom to top; an apex ring holds one point.
 * @returns Valid pieces, or null when any piece encloses no valid solid.
 */
export function generatorRevolveCrossBrushes(rings: readonly (readonly THREE.Vector3[])[]): SolidBrush[] | null {
  const pieces: SolidBrush[] = [];
  for (const corners of GENERATOR_REVOLVE_CROSS_PIECES) {
    const brush = solidHullBrushFromPoints(rings.flatMap((ring) => generatorRevolveCrossPick(ring, corners)));
    if (!brush || !SolidBrushValidator.validateGenerated(brush).valid) return null;
    pieces.push(brush);
  }
  return pieces;
}

/**
 * Picks a piece's corners from one ring, or the apex of a collapsed ring.
 *
 * @param ring Cross ring or apex.
 * @param corners Ring indices of the piece.
 * @returns Piece points on this ring.
 */
function generatorRevolveCrossPick(ring: readonly THREE.Vector3[], corners: readonly number[]): THREE.Vector3[] {
  if (ring.length < GENERATOR_REVOLVE_CROSS_CORNERS) return ring.slice(0, 1).map((point) => point.clone());
  return corners.map((corner) => (ring[corner] ?? new THREE.Vector3()).clone());
}
