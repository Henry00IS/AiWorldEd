import * as THREE from 'three';
import type { SolidScriptElements } from './solid_script_elements.js';
import { solidScriptMemberRead } from './solid_script_members.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/**
 * Where a current item is and which way it faces, by the name it is filled in
 * as.
 */
interface SolidScriptSystemFillItem {
  /** Folded name, such as $face. */
  element: string;
  /** Member that gives its place: Position, or Center. */
  position: string;
  /** Member that gives the way it faces, or an empty text when it has none. */
  normal: string;
}

/**
 * Current items the short forms read, in the order they are looked for in one
 * scope.
 */
const SOLID_SCRIPT_SYSTEM_FILL_ITEMS: readonly SolidScriptSystemFillItem[] = [
  { element: '$vertex', position: 'Position', normal: 'Normal' },
  { element: '$point', position: 'Position', normal: 'Normal' },
  { element: '$face', position: 'Center', normal: 'Normal' },
  { element: '$edge', position: 'Center', normal: '' },
  { element: '$object', position: 'Center', normal: '' },
  { element: '$item', position: 'Center', normal: '' },
];

/** What each short form reads: the place or the way it faces, and which axis. */
const SOLID_SCRIPT_SYSTEM_FILL_SHORTS: Readonly<Record<string, { normal: boolean; axis: 0 | 1 | 2 }>> = {
  $x: { normal: false, axis: 0 },
  $y: { normal: false, axis: 1 },
  $z: { normal: false, axis: 2 },
  $nx: { normal: true, axis: 0 },
  $ny: { normal: true, axis: 1 },
  $nz: { normal: true, axis: 2 },
};

/**
 * Reads a member of a current item, or the item itself when it has no such
 * member, such as a vector in a list.
 *
 * @param held Current item.
 * @param member Member name.
 * @param elements Geometry values of the run.
 * @returns Value.
 */
function solidScriptSystemFillMember(
  held: SolidScriptValue,
  member: string,
  elements: SolidScriptElements,
): SolidScriptValue {
  try {
    return solidScriptMemberRead(held, member, elements, member);
  } catch {
    return held;
  }
}

/**
 * Reads one axis of the place or direction of a current item.
 *
 * @param held Current item.
 * @param member Member that gives the vector, or an empty text for none.
 * @param axis Axis from 0.
 * @param elements Geometry values of the run.
 * @returns Number, or undefined when the item has no such vector.
 */
function solidScriptSystemFillAxis(
  held: SolidScriptValue,
  member: string,
  axis: 0 | 1 | 2,
  elements: SolidScriptElements,
): SolidScriptValue {
  if (member === '') return undefined;
  const source = solidScriptSystemFillMember(held, member, elements);
  if (source instanceof THREE.Vector3) return source.getComponent(axis);
  const numbers = solidScriptValueNumbers(source);
  return numbers?.length === 3 ? numbers[axis] : undefined;
}

/**
 * Reads a short form such as $X or $NY from the innermost current item: the
 * position of a vertex or point, the center of a face, edge, brush or other
 * item, and the normal of a vertex, point or face.
 *
 * @param name Folded name, such as $x.
 * @param scope Scope of the running line.
 * @param elements Geometry values of the run.
 * @returns Number, or undefined when the name is no short form or nothing fills
 *   it.
 */
export function solidScriptSystemFillShort(
  name: string,
  scope: SolidScriptScope,
  elements: SolidScriptElements,
): SolidScriptValue {
  const short = SOLID_SCRIPT_SYSTEM_FILL_SHORTS[name];
  if (!short) return undefined;
  for (let current: SolidScriptScope | null = scope; current; current = current.parent)
    for (const item of SOLID_SCRIPT_SYSTEM_FILL_ITEMS) {
      const held = current.variableOwn(item.element);
      if (held === undefined) continue;
      return solidScriptSystemFillAxis(held, short.normal ? item.normal : item.position, short.axis, elements);
    }
  return undefined;
}
