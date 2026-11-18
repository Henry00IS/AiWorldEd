import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import { SolidScriptElement, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/**
 * Reads the faces a line works on now: those its Of gives (faces, or every face
 * of the brushes it gives), else [$Selected.Faces]. A face a list held that was
 * cut away has left it; a single face that was cut away stops the line.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Faces read from the latest geometry, each piece of a split face.
 */
export function solidScriptFaceTargets(run: SolidScriptBlockRun, label: string): SolidScriptFaceFacts[] {
  const given = run.ofValues();
  const values = given ?? run.selectedGet('faces');
  if (values.length === 0)
    throw new Error(
      given
        ? `${label} has no faces in Of; check that Of holds faces or brushes`
        : `${label} has no faces to work on; pick some with Select Faces above it, or give them in Of`,
    );
  const faces: SolidScriptFaceFacts[] = [];
  for (const value of values) {
    if (!(value instanceof SolidScriptElement) || (value.kind !== 'face' && value.kind !== 'brush'))
      throw new Error(`${label} takes faces or brushes, not ${solidScriptKindNamed(value)}`);
    const read = run.elements.faces(value);
    if (read.length === 0 && values.length === 1) throw new Error(`${String(value)} was cut away by a line above`);
    for (const face of read)
      if (!faces.some((known) => known.leaf === face.leaf && known.index === face.index)) faces.push(face);
  }
  return faces;
}

/**
 * Groups items by the solid or mesh they belong to.
 *
 * @param items Faces or edges.
 * @param leafOf Solid or mesh of an item.
 * @returns Items per solid or mesh.
 */
export function solidScriptFaceGroups<Item>(
  items: readonly Item[],
  leafOf: (item: Item) => SolidScriptGeometryLeaf,
): Map<SolidScriptGeometryLeaf, Item[]> {
  const groups = new Map<SolidScriptGeometryLeaf, Item[]>();
  for (const item of items) {
    const leaf = leafOf(item);
    groups.set(leaf, [...(groups.get(leaf) ?? []), item]);
  }
  return groups;
}

/**
 * Writes a list to the variable a field names, when it names one.
 *
 * @param run Running line.
 * @param key Field key.
 * @param values Values.
 */
export function solidScriptFaceWrite(run: SolidScriptBlockRun, key: string, values: readonly SolidScriptValue[]): void {
  const name = run.text(key).trim();
  if (name !== '') run.variableSet(name.replace(/^\[(.*)\]$/s, '$1'), [...values]);
}

/**
 * Writes one value to the variable a field names, when it names one.
 *
 * @param run Running line.
 * @param key Field key.
 * @param value Value.
 */
export function solidScriptFaceWriteValue(run: SolidScriptBlockRun, key: string, value: SolidScriptValue): void {
  const name = run.text(key).trim();
  if (name !== '') run.variableSet(name.replace(/^\[(.*)\]$/s, '$1'), value);
}
