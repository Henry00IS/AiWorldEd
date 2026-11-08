import { generatorRevolveLoopsWeld } from './generator_revolve_weld.js';
import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { modifierStackConvexFromLoops } from '@/modifier/stack/kinds/generator/modifier_stack_generator_shapes.js';
import { GENERATOR_REVOLVE_EPSILON, type GeneratorRevolveStation } from './generator_revolve_profile.js';

/** Where and how finely a profile is revolved. */
export interface GeneratorRevolveFrame {
  /** Point on the axis at height zero; the axis points up (+Y). */
  center: THREE.Vector3;
  /** Side count of every ring. */
  sides: number;
  /** Ring corner distance per unit of station radius; 1 when absent. */
  radiusScale?: number;
  /** Depth divided by width. */
  aspect?: number;
  /** Fillet fraction; absent for a regular polygon. */
  cornerRadius?: number | undefined;
}

/**
 * Returns the frame of one cross-section: four-sided square, filleted square
 * with four equally sampled corners, or the unchanged round polygon.
 *
 * @param frame Round frame.
 * @param section Starting station of the run, or true for a square.
 * @returns Frame of the run.
 */
export function generatorRevolveSectionFrame(
  frame: GeneratorRevolveFrame,
  section: boolean | GeneratorRevolveStation,
): GeneratorRevolveFrame {
  const square =
    typeof section === 'boolean' ? section : section.square || (section.rounded && section.cornerRadius === 0);
  if (square) return { ...frame, sides: 4, radiusScale: Math.SQRT2, cornerRadius: undefined };
  if (typeof section !== 'boolean' && section.rounded)
    return { ...frame, sides: Math.ceil(frame.sides / 4) * 4, cornerRadius: section.cornerRadius ?? 0.25 };
  return frame;
}

/**
 * Builds the regular ring of one station, or its apex when the radius is zero.
 *
 * @param frame Revolve frame.
 * @param station Station in world units.
 * @returns Ring points, or one point for an apex.
 */
export function generatorRevolveRing(frame: GeneratorRevolveFrame, station: GeneratorRevolveStation): THREE.Vector3[] {
  const y = frame.center.y + station.height;
  if (station.radius <= GENERATOR_REVOLVE_EPSILON) return [new THREE.Vector3(frame.center.x, y, frame.center.z)];
  const radius = station.radius * (frame.radiusScale ?? 1);
  return Array.from({ length: frame.sides }, (_, index) => {
    const angle = (index / frame.sides) * Math.PI * 2 + Math.PI / frame.sides;
    const corner = frame.cornerRadius;
    const x =
      corner === undefined ? Math.cos(angle) : Math.sign(Math.cos(angle)) * (1 - corner) + Math.cos(angle) * corner;
    const z =
      corner === undefined ? Math.sin(angle) : Math.sign(Math.sin(angle)) * (1 - corner) + Math.sin(angle) * corner;
    return new THREE.Vector3(frame.center.x + x * radius, y, frame.center.z + z * radius * (frame.aspect ?? 1));
  });
}

/**
 * Builds the faces joining two rings: quads, or triangles toward an apex.
 *
 * @param lower Lower ring.
 * @param upper Upper ring.
 * @returns Side loops.
 */
function generatorRevolveBand(lower: readonly THREE.Vector3[], upper: readonly THREE.Vector3[]): THREE.Vector3[][] {
  const count = Math.max(lower.length, upper.length);
  const pick = (ring: readonly THREE.Vector3[], index: number) => ring[ring.length === 1 ? 0 : index % ring.length];
  const loops: THREE.Vector3[][] = [];
  for (let index = 0; index < count; index++) {
    const corners = [pick(lower, index), pick(lower, index + 1), pick(upper, index + 1), pick(upper, index)];
    const unique = corners.filter((corner, at): corner is THREE.Vector3 => !!corner && corners.indexOf(corner) === at);
    if (unique.length >= 3) loops.push(...generatorRevolvePlanarLoops(unique));
  }
  return loops;
}

/**
 * Builds one convex brush from a run of stations: the bottom and top caps
 * (unless they are apexes) and one band per piece.
 *
 * @param frame Revolve frame.
 * @param run Stations in world units, bottom to top.
 * @returns Brush, or null when the run encloses no valid solid.
 */
export function generatorRevolveRunBrush(
  frame: GeneratorRevolveFrame,
  run: readonly GeneratorRevolveStation[],
): SolidBrush | null {
  const rings = run.map((station) => generatorRevolveRing(frame, station));
  const bottom = rings[0];
  const top = rings[rings.length - 1];
  if (!bottom || !top || rings.length < 2) return null;
  const caps = [bottom, top].filter((ring) => ring.length > 1);
  const bands = rings.slice(1).flatMap((ring, index) => generatorRevolveBand(rings[index] ?? ring, ring));
  const brush = modifierStackConvexFromLoops(generatorRevolveLoopsWeld([...caps, ...bands]));
  return brush && SolidBrushValidator.validateGenerated(brush).valid ? brush : null;
}

/**
 * Builds the brushes of every run. A merged run that fails validation falls
 * back to one brush per piece.
 *
 * @param frame Revolve frame.
 * @param runs Runs in world units.
 * @returns Valid convex brushes, bottom to top.
 */
export function generatorRevolveBrushes(
  frame: GeneratorRevolveFrame,
  runs: readonly (readonly GeneratorRevolveStation[])[],
): SolidBrush[] {
  return runs.flatMap((run) => {
    const section = generatorRevolveSectionFrame(frame, run[0] ?? false);
    const merged = generatorRevolveRunBrush(section, run);
    if (merged || run.length <= 2) return merged ? [merged] : [];
    return run.slice(1).flatMap((station, index) => {
      const piece = generatorRevolveRunBrush(section, [run[index] ?? station, station]);
      return piece ? [piece] : [];
    });
  });
}

/**
 * Splits a twisted quad so each resulting face lies on a plane.
 *
 * @param corners Unique face corners in winding order.
 * @returns Planar face loops.
 */
function generatorRevolvePlanarLoops(corners: THREE.Vector3[]): THREE.Vector3[][] {
  const [a, b, c, d] = corners;
  if (!a || !b || !c || !d) return [corners];
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  return Math.abs(normal.dot(d.clone().sub(a))) <= GENERATOR_REVOLVE_EPSILON
    ? [corners]
    : [
        [a, b, c],
        [a, c, d],
      ];
}
