import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { MODIFIER_SMOOTH_FLAT } from '@/modifier/smooth/modifier_smooth_shading.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import { GeneratorRevolvePerimeterLayout } from './generator_revolve_perimeter.js';

/**
 * Keeps real section corners hard while allowing smooth arcs and twist ribbons.
 *
 * @param brush Convex column piece.
 * @param frame Cross-section settings at the piece bottom.
 * @returns Smoothing class per face.
 */
export function generatorRevolveSmoothClasses(brush: SolidBrush, frame: GeneratorRevolveFrame): number[] {
  const perimeter = new GeneratorRevolvePerimeterLayout(frame);
  return brush.planes.map((plane) => {
    if (Math.abs(plane.normal.y) > 0.999) return MODIFIER_SMOOTH_FLAT;
    const edge = perimeter.edge(plane.normal);
    const flat = generatorRevolveEdgeFlat(frame, edge.normal);
    return flat ? (frame.twisted ? edge.index + 1 : MODIFIER_SMOOTH_FLAT) : 0;
  });
}

/**
 * Distinguishes a true flat side from a fillet arc.
 *
 * @param frame Section settings and starting orientation.
 * @param normal Unit-ring edge normal.
 * @returns Whether the edge belongs to a hard-sided ribbon.
 */
function generatorRevolveEdgeFlat(frame: GeneratorRevolveFrame, normal: THREE.Vector3): boolean {
  if (['square', 'polygon', 'chamfered_square'].includes(frame.section ?? '') || frame.cornerRadius === 0) return true;
  if (frame.section !== 'rounded_square' || (frame.cornerRadius ?? 0.25) >= 1) return false;
  const local = normal
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(frame.rotation ?? 0));
  return Math.min(Math.abs(local.x), Math.abs(local.z)) < 1e-6;
}
