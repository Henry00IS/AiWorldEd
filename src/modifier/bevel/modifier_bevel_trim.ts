import type { ModifierBevelOptions } from '@/modifier/volume/modifier_volume_bevel_options.js';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Anchors and directs a trim chart before general UV placement.
 *
 * @param matrix New chart to adjust.
 * @param girder Authored edge.
 * @param options Optional saved controls.
 */
export function modifierBevelTrimApply(
  matrix: SurfaceUvMatrix,
  girder: ModifierBevelGirder,
  options?: ModifierBevelOptions,
): SurfaceUvMatrix {
  if (!options) return matrix;
  const start = girder.start.clone().applyMatrix4(girder.localToWorld);
  const end = girder.end.clone().applyMatrix4(girder.localToWorld);
  const direction = girder.direction.clone().transformDirection(girder.localToWorld);
  const origin = girder.origin.clone().applyMatrix4(girder.localToWorld);
  const first = start.sub(origin).dot(direction);
  const last = end.sub(origin).dot(direction);
  if (options.trimOrigin === 'center') matrix.u.w -= (first + last) / 2;
  if (options.trimOrigin === 'end') matrix.u.w -= Math.abs(first) > Math.abs(last) ? first : last;
  if (options.trimDirection === 'reverse') matrix.u.multiplyScalar(-1);
  matrix.v.w -= options.trimSeam;
  return matrix;
}
