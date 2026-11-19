import type { SolidScriptCommandAccepts } from '@/solid_script/commands/solid_script_command.js';
import {
  SOLID_SCRIPT_ELEMENT_TYPES,
  SolidScriptElement,
  solidScriptValueNumber,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * Kinds of value the editor checks name: each also comes as a list, such as
 * Face List; List alone is a list of anything and Data the values kept under
 * .Data.
 */
export const SOLID_SCRIPT_KINDS = [
  'Number',
  'Text',
  'Yes/No',
  'Vector',
  'Brush',
  'Mesh',
  'Face',
  'Edge',
  'Vertex',
  'List',
  'Data',
] as const;

/**
 * Tells whether a kind is one the editor checks name, such as Face List.
 *
 * @param kind Kind.
 * @returns True when known.
 */
export function solidScriptKindKnown(kind: string): boolean {
  const known: readonly string[] = SOLID_SCRIPT_KINDS;
  if (known.includes(kind)) return true;
  const base = kind.endsWith(' List') ? kind.slice(0, -' List'.length) : '';
  return known.includes(base) && base !== 'List' && base !== 'Data';
}

/**
 * Tells the kind of a running value the way the editor checks name kinds:
 * Number for any number, Vector for two or three numbers, Face List for a list
 * of faces, List for a mixed or empty list.
 *
 * @param value Value.
 * @returns Kind.
 */
export function solidScriptKindOf(value: SolidScriptValue): string {
  if (value === undefined) return 'Text';
  if (typeof value === 'boolean') return 'Yes/No';
  if (value instanceof SolidScriptElement)
    return value.kind === 'brush' && value.mesh ? 'Mesh' : SOLID_SCRIPT_ELEMENT_TYPES[value.kind];
  if (!Array.isArray(value)) return solidScriptValueNumber(value) === undefined ? 'Text' : 'Number';
  const kinds = new Set(value.map(solidScriptKindOf));
  const [only] = kinds;
  if (only === 'Number' && kinds.size === 1 && (value.length === 2 || value.length === 3)) return 'Vector';
  return kinds.size === 1 && only !== undefined && !only.endsWith('List') ? `${only} List` : 'List';
}

/**
 * Names the kind of a running value with its article, as mistakes tell it, such
 * as "a Number", "an Edge" or "a Face List".
 *
 * @param value Value.
 * @returns Words.
 */
export function solidScriptKindNamed(value: SolidScriptValue): string {
  const kind = solidScriptKindOf(value);
  return `${/^[AEIOU]/.test(kind) ? 'an' : 'a'} ${kind}`;
}

/**
 * Kind a more specific kind may be used as, such as Brush for Mesh, because
 * meshes live in the same lists as convex brushes.
 *
 * @param kind Kind.
 * @returns Broader kind, or undefined.
 */
export function solidScriptKindBroader(kind: string): string | undefined {
  if (kind === 'Mesh') return 'Brush';
  return kind === 'Mesh List' ? 'Brush List' : undefined;
}

/**
 * @param accepts What the field accepts.
 * @param kind Kind of the value.
 * @returns True when it does.
 */
export function solidScriptKindAccepted(accepts: SolidScriptCommandAccepts, kind: string): boolean {
  if (accepts === 'Any' || accepts.includes(kind)) return true;
  const broader = solidScriptKindBroader(kind);
  return broader !== undefined && accepts.includes(broader);
}

/**
 * Names the kinds a field accepts for people, such as "a Brush, Face or Text,
 * or a list of them".
 *
 * @param accepts What the field accepts.
 * @returns Kinds in words.
 */
export function solidScriptKindsWords(accepts: SolidScriptCommandAccepts): string {
  if (accepts === 'Any') return 'any value';
  const single = accepts.filter((kind) => kind !== 'List' && !kind.endsWith(' List'));
  const lists = single.length < accepts.length;
  const named =
    single.length > 1 ? `${single.slice(0, -1).join(', ')} or ${single.at(-1) ?? ''}` : (single[0] ?? 'List');
  const article = /^[AEIOU]/.test(named) ? 'an' : 'a';
  return `${article} ${named}${lists && single.length > 0 ? ', or a list of them' : ''}`;
}

/**
 * Says in plain words that a field got a kind of value it cannot use, the same
 * way for the editor checks and a running line.
 *
 * @param label Field caption.
 * @param accepts What the field accepts.
 * @param got Kind it got, or kinds joined by or.
 * @returns Message.
 */
export function solidScriptKindMismatch(label: string, accepts: SolidScriptCommandAccepts, got: string): string {
  return `${label} needs ${solidScriptKindsWords(accepts)}, not ${/^[AEIOU]/.test(got) ? 'an' : 'a'} ${got}`;
}

/**
 * Tells whether a value of a kind fits kinds a function input declares: any
 * list fits List, a list of numbers fits Vector for the function to check its
 * length, and a number fits Text. Unsure, for the editor checks, text also fits
 * Number, as text may read as one when the script runs.
 *
 * @param kinds Kinds the input takes, or Any.
 * @param kind Kind of the value.
 * @param unsure True when the kind is only known from the script's text.
 * @returns True when it fits.
 */
export function solidScriptKindFits(kinds: 'Any' | readonly string[], kind: string, unsure = false): boolean {
  if (kinds === 'Any' || kinds.includes(kind)) return true;
  const broader = solidScriptKindBroader(kind);
  if (broader !== undefined && (kinds.includes(broader) || solidScriptKindFits(kinds, broader, unsure))) return true;
  if (kinds.includes('List') && (kind.endsWith('List') || kind === 'Vector')) return true;
  if (kinds.includes('Vector') && (kind === 'List' || kind === 'Number List')) return true;
  if (kinds.includes('Text') && kind === 'Number') return true;
  return unsure && kinds.includes('Number') && kind === 'Text';
}
