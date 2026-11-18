import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import type { SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SolidScriptElement, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/**
 * Reads the brushes a line works on now: those its Of gives, else
 * [$Selected.Brushes]. Meshes are included, as they are in that list.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Latest solids and meshes, each once.
 */
export function solidScriptBrushTargets(run: SolidScriptBlockRun, label: string): SolidScriptGeometryLeaf[] {
  const given = run.ofValues();
  const values = given ?? run.selectedGet('brushes');
  if (values.length === 0) throw new Error(solidScriptBrushTargetsEmpty(label, given !== null));
  const leaves: SolidScriptGeometryLeaf[] = [];
  for (const value of values) leaves.push(...solidScriptBrushTarget(run, label, value, leaves));
  return leaves;
}

/**
 * Tells why a line has no brushes to work on.
 *
 * @param label Command, for messages.
 * @param given True when Of was set.
 * @returns Message.
 */
function solidScriptBrushTargetsEmpty(label: string, given: boolean): string {
  return given
    ? `${label} has no brushes in Of; check that Of holds brushes or meshes`
    : `${label} has no brushes to cut; build some above it, or give them in Of`;
}

/**
 * Reads one Of or selection value as a solid or mesh, once.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param value Value from Of or [$Selected.Brushes].
 * @param known Leaves already collected.
 * @returns The leaf, or none when it is already in known.
 */
function solidScriptBrushTarget(
  run: SolidScriptBlockRun,
  label: string,
  value: SolidScriptValue,
  known: readonly SolidScriptGeometryLeaf[],
): SolidScriptGeometryLeaf[] {
  if (!(value instanceof SolidScriptElement) || value.kind !== 'brush')
    throw new Error(
      `${label} takes brushes, not ${solidScriptKindNamed(value)}; give a brush in Of, or leave Of empty to use [$Selected.Brushes]`,
    );
  const leaf = run.leafLatest(run.elements.leaf(value));
  return known.includes(leaf) ? [] : [leaf];
}
