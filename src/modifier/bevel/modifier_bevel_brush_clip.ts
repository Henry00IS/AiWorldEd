import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import type { ModifierBevelEdgeCut } from './modifier_bevel_brush_edges.js';

/**
 * Clips a brush by each chamfer plane. A plane that would erase the solid is
 * skipped.
 *
 * @param brush Brush in the same space as the planes.
 * @param cuts Chamfer planes.
 * @returns Chamfered brush. The input brush is not modified.
 */
export function modifierBevelClipBrush(brush: SolidBrush, cuts: readonly ModifierBevelEdgeCut[]): SolidBrush {
  return SolidBrushPlaneClip.clipKeepInsideAll(
    brush,
    cuts.map((cut) => cut.plane),
  );
}
