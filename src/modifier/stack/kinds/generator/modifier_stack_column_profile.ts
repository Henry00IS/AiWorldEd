import { curveConstrain } from '@/curve/model/curve_constrain.js';
import { curveDecode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';

/** Largest share of the column height a legacy base or capital may take. */
const MODIFIER_STACK_COLUMN_LEGACY_CAP_SHARE = 0.45;

/**
 * Rebuilds the profile of a column saved before profiles existed, from its base
 * height, capital height, shaft radius and shaft taper. Stretched to the same
 * height it builds the same brushes the old column did.
 *
 * @param parameters Normalized column parameters.
 * @param height Column height in metres.
 * @returns Profile curve.
 */
export function modifierStackColumnLegacyProfile(parameters: Record<string, unknown>, height: number): Curve {
  const cap = height * MODIFIER_STACK_COLUMN_LEGACY_CAP_SHARE;
  const safe = Math.max(height, 1e-6);
  const base = Math.min(modifierStackNumber(parameters['baseHeight'], 0.25, 0, 100), cap) / safe;
  const capital = Math.min(modifierStackNumber(parameters['capitalHeight'], 0.25, 0, 100), cap) / safe;
  const shaft = modifierStackNumber(parameters['shaftRadius'], 0.75, 0.05, 1);
  const top = shaft * modifierStackNumber(parameters['taper'], 1, 0.05, 1);
  const points: [number, number][] = [];
  if (base > 0) points.push([0, 1], [base, 1]);
  points.push([base, shaft], [1 - capital, top]);
  if (capital > 0) points.push([1 - capital, 1], [1, 1]);
  return curveConstrain(curveFromPolyline(points));
}

/**
 * Returns the profile a column builds: its stored curve, or the legacy profile
 * when none is stored.
 *
 * @param parameters Normalized column parameters.
 * @param height Column height in metres.
 * @returns Profile curve.
 */
export function modifierStackColumnProfile(parameters: Record<string, unknown>, height: number): Curve {
  return curveDecode(parameters['profile']) ?? modifierStackColumnLegacyProfile(parameters, height);
}
