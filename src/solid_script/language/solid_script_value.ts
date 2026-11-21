import type { SolidScriptPath } from './solid_script_path_model.js';

/** Runtime value of the solid script language. */
export type SolidScriptValue = number | string | boolean | undefined | SolidScriptElement | SolidScriptValue[];

/**
 * What a geometry value stands for: a brush or mesh, one of its faces, edges or
 * corners, or the Data of one.
 */
export type SolidScriptElementKind = 'brush' | 'path' | 'face' | 'edge' | 'vertex' | 'point' | 'data';

/**
 * A geometry value: a stable id the run looks up when it is read, so it follows
 * the geometry through later changes. The same element is always the same
 * object.
 */
export class SolidScriptElement {
  /**
   * @param kind What it stands for.
   * @param id Number of the element in its run.
   * @param name Name it shows, such as a brush's Name; empty shows the kind and
   *   id.
   */
  /**
   * True when this object is a mesh, not a convex brush. Only used when kind is
   * brush; the run updates it if the leaf later becomes a mesh or a brush.
   */
  mesh = false;

  constructor(
    readonly kind: SolidScriptElementKind,
    readonly id: number,
    readonly name = '',
  ) {}

  /**
   * Names the element for messages and text, such as Face 3.
   *
   * @returns Name.
   */
  toString(): string {
    return this.name || `${solidScriptElementType(this)} ${this.id}`;
  }
}

/** A point with its position and the unit direction it faces. */
export class SolidScriptPoint extends SolidScriptElement {
  /**
   * @param position X, Y and Z of the point.
   * @param normal Unit direction, or world up when no direction was supplied.
   */
  constructor(
    readonly position: number[],
    readonly normal: number[] = [0, 1, 0],
  ) {
    super('point', -1);
  }
}

/**
 * A Path: points joined by segments, open or closed, such as a Path line or a
 * Square. It holds the path as it is now in script space; the run updates it
 * when a line moves the path.
 */
export class SolidScriptPathElement extends SolidScriptElement {
  /**
   * @param id Number of the path in its run.
   * @param name Name it shows.
   * @param path Points in script space, as X, Y and Z.
   */
  constructor(
    id: number,
    name: string,
    public path: SolidScriptPath<number[]>,
  ) {
    super('path', id, name);
  }
}

/** Friendly type of each element kind. */
export const SOLID_SCRIPT_ELEMENT_TYPES: Readonly<Record<SolidScriptElementKind, string>> = {
  brush: 'Solid',
  path: 'Path',
  face: 'Face',
  edge: 'Edge',
  vertex: 'Vertex',
  point: 'Point',
  data: 'Data',
};

/**
 * Names the kind of a geometry value: Solid or Mesh for an object, otherwise
 * the kind of element, such as Face.
 *
 * @param element Element.
 * @returns Kind.
 */
export function solidScriptElementType(element: SolidScriptElement): string {
  return element.kind === 'brush' && element.mesh ? 'Mesh' : SOLID_SCRIPT_ELEMENT_TYPES[element.kind];
}

/**
 * Names the kind of a list whose items all share one geometry kind, or hold
 * solids and meshes together as an Object List.
 *
 * @param kinds Kinds of the items.
 * @returns Kind of the list, or undefined when the items are not one geometry
 *   kind.
 */
export function solidScriptElementListType(kinds: ReadonlySet<string>): string | undefined {
  if (kinds.size === 2 && kinds.has('Solid') && kinds.has('Mesh')) return 'Object List';
  const [only] = kinds;
  return kinds.size === 1 && only && (only === 'Mesh' || Object.values(SOLID_SCRIPT_ELEMENT_TYPES).includes(only))
    ? `${only} List`
    : undefined;
}

/** Most list entries a range or comprehension may produce. */
export const SOLID_SCRIPT_LIST_LIMIT = 10000;

/**
 * Returns truthiness of a value.
 *
 * @param value Value.
 * @returns True unless false, zero, empty, or undef.
 */
export function solidScriptValueTruthy(value: SolidScriptValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  return Boolean(value);
}

/**
 * Returns the value as a finite number, or undefined. Text that spells a
 * number, such as "3", counts as that number: a value is plain text underneath
 * and only becomes a number where one is needed.
 *
 * @param value Value.
 * @returns Number or undefined.
 */
export function solidScriptValueNumber(value: SolidScriptValue): number | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    const number = text === '' ? NaN : Number(text);
    return Number.isFinite(number) ? number : undefined;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Returns text that spells a number as that number and leaves every other value
 * as it is.
 *
 * @param value Value.
 * @returns Number or the value.
 */
export function solidScriptValueNumeric(value: SolidScriptValue): SolidScriptValue {
  return typeof value === 'string' ? (solidScriptValueNumber(value) ?? value) : value;
}

/**
 * Names the kind of a value in plain words for the variable explorer, help and
 * error messages: Number, Whole Number, Text, Yes/No, Vector, List of Numbers,
 * List of Text, List, or Nothing.
 *
 * @param value Value.
 * @returns Friendly type.
 */
export function solidScriptValueType(value: SolidScriptValue): string {
  if (value === undefined) return 'Nothing';
  if (typeof value === 'boolean') return 'Yes/No';
  if (value instanceof SolidScriptElement) return solidScriptElementType(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return 'List';
    const kinds = new Set(value.map((entry) => solidScriptValueType(entry)));
    const numbers = [...kinds].every((kind) => kind === 'Number' || kind === 'Whole Number');
    if (numbers && (value.length === 2 || value.length === 3)) return 'Vector';
    if (numbers) return 'List of Numbers';
    if (kinds.size === 1 && kinds.has('Text')) return 'List of Text';
    if (kinds.size === 1 && kinds.has('Vector')) return 'List of Vectors';
    return solidScriptElementListType(kinds) ?? 'List';
  }
  const number = solidScriptValueNumber(value);
  if (number === undefined) return 'Text';
  return Number.isInteger(number) ? 'Whole Number' : 'Number';
}

/**
 * Returns the value as a list of numbers, or undefined when any entry is not a
 * number.
 *
 * @param value Value.
 * @returns Numbers or undefined.
 */
export function solidScriptValueNumbers(value: SolidScriptValue): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(solidScriptValueNumber);
  return numbers.every((entry): entry is number => entry !== undefined) ? numbers : undefined;
}

/**
 * How far apart two numbers may be and still count as equal, so 0.1 + 0.2 ==
 * 0.3.
 */
export const SOLID_SCRIPT_EQUAL_TOLERANCE = 0.001;

/**
 * Compares two values structurally; numbers count as equal when they are at
 * most the tolerance apart.
 *
 * @param left First value.
 * @param right Second value.
 * @param tolerance Largest gap between two equal numbers.
 * @returns True when equal.
 */
export function solidScriptValueEquals(
  left: SolidScriptValue,
  right: SolidScriptValue,
  tolerance = SOLID_SCRIPT_EQUAL_TOLERANCE,
): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => solidScriptValueEquals(entry, right[index], tolerance))
    );
  }
  const a = solidScriptValueNumeric(left);
  const b = solidScriptValueNumeric(right);
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) <= tolerance;
  return a === b;
}

/**
 * Formats a value the way str() does.
 *
 * @param value Value.
 * @returns Text.
 */
export function solidScriptValueText(value: SolidScriptValue): string {
  if (value === undefined) return 'undef';
  if (Array.isArray(value)) return `[${value.map(solidScriptValueText).join(', ')}]`;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Formats a value for error messages: text in quotes, everything else as str()
 * writes it.
 *
 * @param value Value.
 * @returns Text.
 */
export function solidScriptValueShow(value: SolidScriptValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(solidScriptValueShow).join(', ')}]`;
  return solidScriptValueText(value);
}
