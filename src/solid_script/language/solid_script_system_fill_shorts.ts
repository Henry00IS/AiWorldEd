import * as THREE from 'three';
import type { SolidScriptElements } from './solid_script_elements.js';
import { solidScriptMemberRead } from './solid_script_members.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** One way a short fill such as $X is read from the current element. */
interface SolidScriptSystemFillShort {
  /** Current-element name, such as $vertex. */
  element: string;
  /** Member that holds the vector, or empty when the element is the vector. */
  member: string;
  /** Axis of that vector. */
  axis: 'x' | 'y' | 'z';
}

/** Short fills and the current-element members they stand for, by name key. */
const SOLID_SCRIPT_SYSTEM_FILL_SHORTS: Readonly<Record<string, readonly SolidScriptSystemFillShort[]>> = {
  $x: [
    { element: '$vertex', member: 'Position', axis: 'x' },
    { element: '$point', member: 'Position', axis: 'x' },
  ],
  $y: [
    { element: '$vertex', member: 'Position', axis: 'y' },
    { element: '$point', member: 'Position', axis: 'y' },
  ],
  $z: [
    { element: '$vertex', member: 'Position', axis: 'z' },
    { element: '$point', member: 'Position', axis: 'z' },
  ],
  $nx: [
    { element: '$vertex', member: 'Normal', axis: 'x' },
    { element: '$face', member: 'Normal', axis: 'x' },
  ],
  $ny: [
    { element: '$vertex', member: 'Normal', axis: 'y' },
    { element: '$face', member: 'Normal', axis: 'y' },
  ],
  $nz: [
    { element: '$vertex', member: 'Normal', axis: 'z' },
    { element: '$face', member: 'Normal', axis: 'z' },
  ],
  $cx: [{ element: '$face', member: 'Center', axis: 'x' }],
  $cy: [{ element: '$face', member: 'Center', axis: 'y' }],
  $cz: [{ element: '$face', member: 'Center', axis: 'z' }],
};

/**
 * Reads a member of a current element, or nothing when that value has no such
 * member.
 *
 * @param held Current element.
 * @param member Member name, such as Position.
 * @param elements Element store of the run.
 * @returns Member value, or undefined.
 */
function solidScriptSystemFillMember(
  held: SolidScriptValue,
  member: string,
  elements: SolidScriptElements,
): SolidScriptValue {
  try {
    return solidScriptMemberRead(held, member, elements, member);
  } catch {
    return undefined;
  }
}

/**
 * Reads one axis of a vector, or of a member that holds a vector, falling back
 * to the value itself when it is already a vector.
 *
 * @param held Current element or vector.
 * @param option Member and axis to read.
 * @param elements Element store of the run.
 * @returns Axis number, or undefined.
 */
function solidScriptSystemFillAxis(
  held: SolidScriptValue,
  option: SolidScriptSystemFillShort,
  elements: SolidScriptElements,
): SolidScriptValue {
  const source = option.member === '' ? held : (solidScriptSystemFillMember(held, option.member, elements) ?? held);
  if (source instanceof THREE.Vector3) return source[option.axis];
  const numbers = solidScriptValueNumbers(source);
  const index = option.axis === 'x' ? 0 : option.axis === 'y' ? 1 : 2;
  return numbers?.[index];
}

/**
 * Reads a short fill such as $X from the current $Vertex, $Point or $Face when
 * that element is filled in, so $X is $Vertex.Position.X and $NZ is
 * $Face.Normal.Z or $Vertex.Normal.Z.
 *
 * @param name Name key, such as $x.
 * @param scope Scope of the running line.
 * @param elements Element store of the run.
 * @returns Axis number, or undefined when the short does not apply.
 */
export function solidScriptSystemFillShort(
  name: string,
  scope: SolidScriptScope,
  elements: SolidScriptElements,
): SolidScriptValue {
  const options = SOLID_SCRIPT_SYSTEM_FILL_SHORTS[name];
  if (!options) return undefined;
  for (const option of options) {
    const held = scope.variableGet(option.element);
    if (held === undefined) continue;
    const axis = solidScriptSystemFillAxis(held, option, elements);
    if (axis !== undefined) return axis;
  }
  return undefined;
}
