import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';

/** Remembered validity of each bevelled shape. */
const modifierStackBevelShapeValidity = new WeakMap<ModifierBevelDerivedBrush, boolean>();

/**
 * Returns whether a brush may enter the CSG pipeline: every vertex is finite
 * and the brush passes the generated-brush validation (convex, consistent
 * topology, no degenerate faces or coincident vertices).
 *
 * @param brush Brush geometry.
 * @returns True when valid.
 */
export function modifierStackBrushGeometryValid(brush: SolidBrush): boolean {
  if (!brush.vertices.every((vertex) => Number.isFinite(vertex.x + vertex.y + vertex.z))) return false;
  return SolidBrushValidator.validateGenerated(brush).valid;
}

/**
 * Drops generated brushes that are not valid, so neither later modifiers nor
 * the CSG pipeline ever see them; units left empty are dropped too. Authored
 * units pass through unchanged.
 *
 * @param units Step output.
 * @returns Valid output and the number of brushes dropped.
 */
export function modifierStackValidUnits(units: readonly ModifierStackUnit[]): {
  units: ModifierStackUnit[];
  dropped: number;
} {
  let dropped = 0;
  const kept: ModifierStackUnit[] = [];
  for (const unit of units) {
    const brushes = unit.authored ? unit.brushes : unit.brushes.filter(modifierStackInstanceValid);
    dropped += unit.brushes.length - brushes.length;
    if (brushes.length > 0) kept.push(brushes === unit.brushes ? unit : { ...unit, brushes });
  }
  return { units: kept, dropped };
}

/**
 * Returns whether one generated brush is valid.
 *
 * @param instance Generated brush.
 * @returns True when valid.
 */
function modifierStackInstanceValid(instance: SolidBrushInstance): boolean {
  return modifierStackBrushGeometryValid(instance.brush);
}

/**
 * Returns whether a bevelled shape is a valid brush, remembering the answer for
 * the cached shape so unchanged brushes are not validated again.
 *
 * @param derived Bevelled shape.
 * @returns True when the CSG pipeline may use it.
 */
export function modifierStackBevelShapeValid(derived: ModifierBevelDerivedBrush): boolean {
  const known = modifierStackBevelShapeValidity.get(derived);
  if (known !== undefined) return known;
  const valid = modifierStackBrushGeometryValid(derived.localBrush);
  modifierStackBevelShapeValidity.set(derived, valid);
  return valid;
}
