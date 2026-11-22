import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import { SolidScriptElement, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
import { solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';

/**
 * Reads the faces a line works on now: those its Of gives (faces, or every face
 * of the brushes it gives), else [$Selected.Faces]. A face a list held that was
 * cut away has left it; a single face that was cut away stops the line. Where,
 * when the line has one, keeps only the faces that pass it.
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
      given ? `${label} has no faces in Of; check that Of holds faces or objects` : solidScriptOfEmpty(label, 'faces'),
    );
  const faces: SolidScriptFaceFacts[] = [];
  const seen = new WeakMap<SolidScriptGeometryLeaf, Set<number>>();
  for (const value of values) {
    if (!(value instanceof SolidScriptElement) || (value.kind !== 'face' && value.kind !== 'brush'))
      throw new Error(`${label} takes faces or objects, not ${solidScriptKindNamed(value)}`);
    const read = run.elements.faces(value);
    if (read.length === 0 && values.length === 1) throw new Error(`${String(value)} was cut away by a line above`);
    for (const face of read) if (solidScriptFaceSeen(seen, face)) faces.push(face);
  }
  return solidScriptFaceWhere(run, faces);
}

/**
 * Keeps the faces that pass the line's Where, with [$Face] the face; a line
 * without a Where, or with an empty one, keeps them all.
 *
 * @param run Running line.
 * @param faces Faces the line would work on.
 * @returns Faces that pass.
 */
function solidScriptFaceWhere(run: SolidScriptBlockRun, faces: SolidScriptFaceFacts[]): SolidScriptFaceFacts[] {
  if (run.source('where').trim() === '') return faces;
  return faces.filter((face, index) =>
    solidScriptConditionHolds(run, 'where', { $Face: run.elements.face(face), $Index: index, $Count: faces.length }),
  );
}

/**
 * Tells whether a face has not yet been kept, and remembers it when it is new.
 *
 * @param seen Faces already kept, by solid or mesh and number.
 * @param face Face.
 * @returns True when it is new.
 */
function solidScriptFaceSeen(seen: WeakMap<SolidScriptGeometryLeaf, Set<number>>, face: SolidScriptFaceFacts): boolean {
  const known = seen.get(face.leaf) ?? new Set();
  if (known.has(face.index)) return false;
  known.add(face.index);
  seen.set(face.leaf, known);
  return true;
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
