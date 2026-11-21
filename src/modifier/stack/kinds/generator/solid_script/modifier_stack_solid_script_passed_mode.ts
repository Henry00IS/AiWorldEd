import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierSmoothTagCopy } from '@/modifier/smooth/modifier_smooth_shading.js';
import { modifierStackReshapeStandIn } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';
import { solidScriptModeOperation } from '@/solid_script/language/solid_script_mode.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';
import type { ModifierStackSolidScriptPassed } from './modifier_stack_solid_script_layout.js';

/**
 * Groups passed brushes into Input Objects passes, each starting at index 0.
 *
 * @param passed Passed brushes in run order.
 * @returns One group per pass, in run order.
 */
export function modifierStackSolidScriptPassedGroups(
  passed: readonly ModifierStackSolidScriptPassed[],
): readonly (readonly ModifierStackSolidScriptPassed[])[] {
  const groups: ModifierStackSolidScriptPassed[][] = [];
  for (const entry of passed) {
    if (entry.index === 0) groups.push([]);
    const group = groups[groups.length - 1];
    if (group) group.push(entry);
  }
  return groups;
}

/**
 * Applies each passed brush Mode to the matching unit brush, leaving a brush
 * unchanged when its Mode was not set or already matches.
 *
 * @param units Units of one pass.
 * @param entries Passed brushes of that pass, in received-index order.
 * @returns Units, with stand-ins where Mode changed.
 */
export function modifierStackSolidScriptPassedModeUnits(
  units: readonly ModifierStackUnit[],
  entries: readonly ModifierStackSolidScriptPassed[],
): ModifierStackUnit[] {
  const operations = modifierStackSolidScriptPassedOperations(entries);
  if (operations.size === 0) return [...units];
  let index = 0;
  return units.map((unit) => {
    const next = modifierStackSolidScriptPassedModeUnit(unit, operations, index);
    index += unit.brushes.length;
    return next;
  });
}

/**
 * Maps received indices to the CSG operations their Modes name.
 *
 * @param entries Passed brushes of one pass.
 * @returns Operation by received index.
 */
function modifierStackSolidScriptPassedOperations(
  entries: readonly ModifierStackSolidScriptPassed[],
): ReadonlyMap<number, SolidOperation> {
  const operations = new Map<number, SolidOperation>();
  for (const entry of entries) {
    const operation = solidScriptModeOperation(entry.mode);
    if (operation !== undefined) operations.set(entry.index, operation);
  }
  return operations;
}

/**
 * Applies Modes to every brush of a unit, in received-index order.
 *
 * @param unit Unit.
 * @param operations Operation by received index.
 * @param start Received index of the unit's first brush.
 * @returns The unit, or a reshaped copy when a Mode changed.
 */
function modifierStackSolidScriptPassedModeUnit(
  unit: ModifierStackUnit,
  operations: ReadonlyMap<number, SolidOperation>,
  start: number,
): ModifierStackUnit {
  const brushes = unit.brushes.map((brush, offset) =>
    modifierStackSolidScriptPassedModeBrush(brush, operations.get(start + offset)),
  );
  if (brushes.every((brush, offset) => brush === unit.brushes[offset])) return unit;
  return { ...unit, brushes, reshaped: unit.authored || unit.reshaped };
}

/**
 * Returns a stand-in with a new CSG operation when the Mode differs.
 *
 * @param brush Brush of the pass.
 * @param operation Operation to apply, or none when Mode was unset.
 * @returns The brush, or a stand-in with the new operation.
 */
function modifierStackSolidScriptPassedModeBrush(
  brush: SolidBrushInstance,
  operation: SolidOperation | undefined,
): SolidBrushInstance {
  if (operation === undefined || brush.operation === operation) return brush;
  const surfaces = brush.brush.faces.map((_, face) => brush.getFaceSurface(face));
  const standIn = modifierStackReshapeStandIn(brush, brush.brush.clone(), surfaces);
  standIn.operation = operation;
  modifierSmoothTagCopy(brush, standIn);
  return standIn;
}
