import {
  SolidScriptDictionary,
  SolidScriptElement,
  SolidScriptPathElement,
  solidScriptElementType,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Makes the second objects and paths a copy needs. */
export interface SolidScriptValueCopyHost {
  /**
   * Makes an independent second solid or mesh, without its Data.
   *
   * @param element Solid or mesh to copy.
   * @returns The new object.
   */
  objectCopy(element: SolidScriptElement): SolidScriptElement;
  /**
   * Gives a copied solid or mesh its own copy of every value kept under the
   * .Data of the original and of its faces, edges, corners and face corners.
   *
   * @param from Original.
   * @param to Copy.
   * @param copy Copies one value.
   */
  objectDataCopy(
    from: SolidScriptElement,
    to: SolidScriptElement,
    copy: (value: SolidScriptValue) => SolidScriptValue,
  ): void;
  /**
   * Makes an independent second Path.
   *
   * @param element Path to copy.
   * @returns The new Path.
   */
  pathCopy(element: SolidScriptPathElement): SolidScriptPathElement;
  /**
   * Lists every value kept under the .Data of a solid or mesh and of its parts.
   *
   * @param element Solid or mesh.
   * @returns Values.
   */
  objectDataValues(element: SolidScriptElement): SolidScriptValue[];
}

/** Element kinds that are parts of an object and cannot stand on their own. */
const SOLID_SCRIPT_COPY_PARTS: ReadonlySet<string> = new Set(['face', 'edge', 'vertex', 'facecorner']);

/**
 * Makes a deep copy of a value: lists and Dictionaries all the way down, Paths,
 * and solids and meshes as new objects. Numbers, text, Yes/No, Rotations,
 * points and Curves never change once made, so they stay as they are. A value
 * that cannot be copied stops the copy before anything is made.
 *
 * @param value Value to copy.
 * @param shown Name it was read from, for messages.
 * @param host Makes the new objects and paths.
 * @returns The copy.
 */
export function solidScriptValueCopy(
  value: SolidScriptValue,
  shown: string,
  host: SolidScriptValueCopyHost,
): SolidScriptValue {
  solidScriptValueCopyCheck(value, shown, host, new Set());
  return solidScriptValueCopyMake(value, host, new Map());
}

/**
 * Stops a copy that would meet a value that cannot be copied.
 *
 * @param value Value to check.
 * @param shown Name it was read from, for messages.
 * @param host Reads the .Data of objects.
 * @param seen Lists and Dictionaries already checked.
 */
function solidScriptValueCopyCheck(
  value: SolidScriptValue,
  shown: string,
  host: SolidScriptValueCopyHost,
  seen: Set<object>,
): void {
  if (!(Array.isArray(value) || value instanceof SolidScriptElement) || seen.has(value)) return;
  seen.add(value);
  if (value instanceof SolidScriptElement) solidScriptValueCopyRefuse(value, shown);
  for (const inner of solidScriptValueCopyInner(value, host)) solidScriptValueCopyCheck(inner, shown, host, seen);
}

/**
 * Lists the values a copy of a value copies as well: the items of a list, the
 * values of a Dictionary and the .Data values of a solid or mesh.
 *
 * @param value List or element.
 * @param host Reads the .Data of objects.
 * @returns Values inside it.
 */
function solidScriptValueCopyInner(
  value: SolidScriptValue[] | SolidScriptElement,
  host: SolidScriptValueCopyHost,
): readonly SolidScriptValue[] {
  if (Array.isArray(value)) return value;
  if (value instanceof SolidScriptDictionary) return [...value.entries.values()].map((entry) => entry.value);
  return value.kind === 'brush' ? host.objectDataValues(value) : [];
}

/**
 * Throws for one value that cannot be copied: the .Data of an object or of a
 * part of one, and a face, edge, corner or face corner, which only exist as
 * part of their object.
 *
 * @param element Value to check.
 * @param shown Name it was read from, for messages.
 */
function solidScriptValueCopyRefuse(element: SolidScriptElement, shown: string): void {
  if (element instanceof SolidScriptDictionary && element.id > 0)
    throw new Error(
      `[${shown}] holds the Data of an object or part, which belongs to it and cannot be copied on its own; copy the object instead, or make your own Dictionary with Merge Dictionary [${shown}] Into Mine`,
    );
  if (SOLID_SCRIPT_COPY_PARTS.has(element.kind))
    throw new Error(
      `[${shown}] holds ${solidScriptElementType(element)} ${element.id}, a part of its object, which cannot be copied on its own; copy the object instead, such as Copy [Box] Into [Spare]`,
    );
}

/**
 * Makes the copy of a value already checked; a list, Dictionary, object or Path
 * met twice is copied once, so the copy shares the same way the original does.
 *
 * @param value Value to copy.
 * @param host Makes the new objects and paths.
 * @param made Copies made so far, by original.
 * @returns The copy.
 */
function solidScriptValueCopyMake(
  value: SolidScriptValue,
  host: SolidScriptValueCopyHost,
  made: Map<object, SolidScriptValue>,
): SolidScriptValue {
  if (!(Array.isArray(value) || value instanceof SolidScriptElement)) return value;
  if (made.has(value)) return made.get(value);
  const copy = solidScriptValueCopyFresh(value, host, made);
  made.set(value, copy);
  return copy;
}

/**
 * Makes the copy of one list, Dictionary, object or Path not copied before.
 * Rotations, points and Curves never change once made, so they stay as they
 * are.
 *
 * @param value Value to copy.
 * @param host Makes the new objects and paths.
 * @param made Copies made so far, by original.
 * @returns The copy.
 */
function solidScriptValueCopyFresh(
  value: SolidScriptValue[] | SolidScriptElement,
  host: SolidScriptValueCopyHost,
  made: Map<object, SolidScriptValue>,
): SolidScriptValue {
  const inner = (item: SolidScriptValue): SolidScriptValue => solidScriptValueCopyMake(item, host, made);
  if (Array.isArray(value)) {
    const list: SolidScriptValue[] = [];
    made.set(value, list);
    for (const item of value) list.push(inner(item));
    return list;
  }
  if (value instanceof SolidScriptDictionary) return solidScriptDictionaryCopyMake(value, inner);
  if (value instanceof SolidScriptPathElement) return host.pathCopy(value);
  return value.kind === 'brush' ? solidScriptObjectCopyMake(value, host, made, inner) : value;
}

/**
 * Makes the copy of a solid or mesh. It is noted before its Data is copied, so
 * Data that holds the object itself points at the copy.
 *
 * @param value Solid or mesh.
 * @param host Makes the new objects.
 * @param made Copies made so far, by original.
 * @param inner Copies one value.
 * @returns The copy.
 */
function solidScriptObjectCopyMake(
  value: SolidScriptElement,
  host: SolidScriptValueCopyHost,
  made: Map<object, SolidScriptValue>,
  inner: (value: SolidScriptValue) => SolidScriptValue,
): SolidScriptElement {
  const copy = host.objectCopy(value);
  made.set(value, copy);
  host.objectDataCopy(value, copy, inner);
  return copy;
}

/**
 * Makes the copy of a Dictionary the script made, every value copied too.
 *
 * @param dictionary Dictionary to copy.
 * @param inner Copies one value.
 * @returns The copy.
 */
function solidScriptDictionaryCopyMake(
  dictionary: SolidScriptDictionary,
  inner: (value: SolidScriptValue) => SolidScriptValue,
): SolidScriptDictionary {
  const copy = new SolidScriptDictionary();
  for (const [key, entry] of dictionary.entries) copy.entries.set(key, { name: entry.name, value: inner(entry.value) });
  return copy;
}
