import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';

/** Elliptical arc of a revolved profile, measured from the equator. */
export interface ModifierStackPrimitiveArc {
  /** First angle in radians; -π/2 is the bottom pole. */
  from: number;
  /** Last angle in radians; π/2 is the top pole. */
  to: number;
  /** Straight pieces along the arc. */
  segments: number;
  /** Height of the equator above the box bottom, in metres. */
  equator: number;
  /** Vertical semi-axis in metres. */
  rise: number;
  /** Horizontal semi-axis in metres. */
  radius: number;
}

/**
 * Samples an elliptical arc into profile stations. Poles get exactly zero
 * radius so they close to a point.
 *
 * @param arc Arc to sample.
 * @returns Stations from the first to the last angle.
 */
export function modifierStackPrimitiveArcStations(arc: ModifierStackPrimitiveArc): GeneratorRevolveStation[] {
  const segments = Math.max(1, Math.round(arc.segments));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = arc.from + ((arc.to - arc.from) * index) / segments;
    return {
      height: arc.equator + arc.rise * Math.sin(angle),
      radius: modifierStackPrimitivePoleSafe(arc.radius * Math.cos(angle), arc.radius),
    };
  });
}

/**
 * Snaps a radius that is almost zero at a pole to exactly zero.
 *
 * @param radius Sampled radius.
 * @param scale Widest radius, for the tolerance.
 * @returns Radius, never negative.
 */
function modifierStackPrimitivePoleSafe(radius: number, scale: number): number {
  return radius <= scale * 1e-9 ? 0 : radius;
}
