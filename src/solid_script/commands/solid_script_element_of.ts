import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import { solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import { SolidScriptElement } from '@/solid_script/language/solid_script_value.js';

/** What a line takes and which selection an empty Of uses. */
export type SolidScriptElementOfKind = 'objects' | 'edges' | 'vertices';

/**
 * Reads the items a line works on: its Of, else the selection, else for edges
 * and corners those of [$Selected.Faces].
 *
 * @param run Running line.
 * @param kind Selection an empty Of uses.
 * @param label Command, for messages.
 * @returns Geometry values, each a solid, mesh, face, edge or corner.
 */
export function solidScriptElementOf(
  run: SolidScriptBlockRun,
  kind: SolidScriptElementOfKind,
  label: string,
): SolidScriptElement[] {
  const given = run.ofValues();
  const picked = run.selectedGet(kind);
  const values = given ?? (picked.length > 0 || kind === 'objects' ? picked : run.selectedGet('faces'));
  if (values.length === 0)
    throw new Error(
      given ? `${label} has nothing in Of; check that Of holds ${kind}` : solidScriptOfEmpty(label, kind),
    );
  return values.map((value) => {
    if (
      !(value instanceof SolidScriptElement) ||
      value.kind === 'point' ||
      value.kind === 'data' ||
      value.kind === 'rotation'
    )
      throw new Error(`${label} takes ${kind}, not ${solidScriptKindNamed(value)}`);
    return value;
  });
}
