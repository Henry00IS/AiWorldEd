import { solidScriptFlowFormulaKinds } from './solid_script_document_flow_formula.js';
import { solidScriptFieldSplit } from '@/solid_script/language/solid_script_field.js';
import { solidScriptMemberType } from '@/solid_script/language/solid_script_members.js';
import { SOLID_SCRIPT_SYSTEM_LISTED } from '@/solid_script/language/solid_script_system.js';
import { solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';

/**
 * The kind of a value only running tells, kept among the kinds a name may hold
 * so the checks stay unsure about it.
 */
export const SOLID_SCRIPT_FLOW_UNKNOWN = '';

/**
 * Kinds the start of a name may hold, by its lower-case key, and what a
 * Function of the script gives when a formula calls it with values of some
 * kinds.
 */
export interface SolidScriptFlowHead {
  (key: string): readonly string[];
  /**
   * Kinds a Function gives for the kinds of its values; none when the script
   * has no such Function.
   */
  call?: (name: string, values: readonly (readonly string[])[]) => readonly string[] | undefined;
}

/**
 * Tells whether a part of a name picks an item, such as Points(2).
 *
 * @param part Part between dots.
 * @returns True for an item.
 */
function solidScriptFlowPicks(part: string): boolean {
  return /\(.*\)$/.test(part);
}

/**
 * Gives a part of a name without the item it picks.
 *
 * @param part Part between dots.
 * @returns Name of the part.
 */
function solidScriptFlowWord(part: string): string {
  return part.replace(/\s*\(.*\)$/, '').trim();
}

/**
 * Gives the kind of one item of a value of a kind: Face for Face List, Number
 * for a Vector, the value itself for a kind that is no list.
 *
 * @param kind Kind.
 * @returns Item kind, or the unknown kind for a list of anything.
 */
export function solidScriptFlowItemOf(kind: string): string {
  if (kind.endsWith(' List')) return kind.slice(0, -' List'.length);
  if (kind === 'Vector') return 'Number';
  return kind === 'List' || kind === 'Data' ? SOLID_SCRIPT_FLOW_UNKNOWN : kind;
}

/**
 * Lists kinds once each, in order.
 *
 * @param kinds Kinds.
 * @returns Kinds without repeats.
 */
export function solidScriptFlowUnique(kinds: readonly string[]): string[] {
  return [...new Set(kinds)];
}

/**
 * Follows one member after a dot for every kind a value may hold.
 *
 * @param kinds Kinds of the value before the dot.
 * @param part Member, maybe picking an item, such as Faces(0).
 * @returns Kinds of the member; a kind without it gives none.
 */
export function solidScriptFlowMember(kinds: readonly string[], part: string): string[] {
  const gives = kinds.flatMap((kind) => {
    if (kind === SOLID_SCRIPT_FLOW_UNKNOWN || kind === 'Data') return [SOLID_SCRIPT_FLOW_UNKNOWN];
    const member = solidScriptMemberType(kind, solidScriptFlowWord(part));
    if (member === null && kind === 'List') return [SOLID_SCRIPT_FLOW_UNKNOWN];
    return member === null ? [] : [member === 'Item' ? SOLID_SCRIPT_FLOW_UNKNOWN : member];
  });
  return solidScriptFlowPicks(part) ? gives.map(solidScriptFlowItemOf) : gives;
}

/**
 * Gives the kind of a system value, such as Face List for $Selected.Faces.
 *
 * @param parts Name split at its dots, the first with its $.
 * @returns Kinds, the unknown kind for one not listed.
 */
function solidScriptFlowSystem(parts: readonly string[]): string[] {
  const two = `${solidScriptFlowWord(parts[0] ?? '')}.${solidScriptFlowWord(parts[1] ?? '')}`.toLowerCase();
  const kind = SOLID_SCRIPT_SYSTEM_LISTED.find(([label]) => label.toLowerCase() === two)?.[1];
  if (kind === undefined) return [SOLID_SCRIPT_FLOW_UNKNOWN];
  return [solidScriptFlowPicks(parts[1] ?? '') ? solidScriptFlowItemOf(kind) : kind];
}

/**
 * Tells whether text closes every bracket and parenthesis it opens, in order,
 * so [Points([K])] reads as one name and [A] and [B] does not.
 *
 * @param text Text between the outer brackets.
 * @returns True when balanced.
 */
function solidScriptFlowBalanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === '[' || char === '(') depth++;
    if (char === ']' || char === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Splits a name at the dots outside its item picks, so Points([=[K] * 0.5]).x
 * gives two parts.
 *
 * @param path Name as written.
 * @returns Parts between dots.
 */
function solidScriptFlowParts(path: string): string[] {
  const parts = [''];
  let depth = 0;
  for (const char of path) {
    if (char === '[' || char === '(') depth++;
    if (char === ']' || char === ')') depth--;
    if (char === '.' && depth === 0) parts.push('');
    else parts[parts.length - 1] += char;
  }
  return parts;
}

/**
 * Tells the kinds a name may hold, followed through its members and items, such
 * as Vector for Brush.Faces.First.Normal: a system value, or the kinds of the
 * script's name it starts with.
 *
 * @param path Name as written, without brackets.
 * @param head Kinds the script's names may hold.
 * @returns Kinds, each once; empty when the name holds nothing known.
 */
export function solidScriptFlowPathKinds(path: string, head: SolidScriptFlowHead): string[] {
  const parts = solidScriptFlowParts(path.trim());
  if (parts.length > 1 && /^(local|persistent)$/i.test(parts[0] ?? '')) parts.splice(0, 2, `${parts[0]}.${parts[1]}`);
  const system = path.trim().startsWith('$');
  const first = parts[0] ?? '';
  let kinds = system ? solidScriptFlowSystem(parts) : [...head(solidScriptFlowWord(first).toLowerCase())];
  if (!system && solidScriptFlowPicks(first)) kinds = kinds.map(solidScriptFlowItemOf);
  for (const part of parts.slice(system ? 2 : 1)) kinds = solidScriptFlowMember(kinds, part);
  return solidScriptFlowUnique(kinds);
}

/**
 * Tells the kinds a name in brackets may hold, such as Points([K]).x; a name
 * built from others, such as Part[I], only running tells.
 *
 * @param text Text inside the brackets.
 * @param head Kinds the script's names may hold.
 * @returns Kinds; the unknown kind when only running tells.
 */
export function solidScriptFlowNameKinds(text: string, head: SolidScriptFlowHead): string[] {
  const outside = text.replace(/\((?:[^()]|\([^()]*\))*\)/g, '');
  if (!solidScriptFlowBalanced(text) || /[[\]]/.test(outside)) return [SOLID_SCRIPT_FLOW_UNKNOWN];
  const kinds = solidScriptFlowPathKinds(text, head);
  return kinds.length > 0 ? kinds : [SOLID_SCRIPT_FLOW_UNKNOWN];
}

/**
 * Tells the kind of numbers or items typed between commas: a Vector for two or
 * three numbers, else a List.
 *
 * @param pieces Items as typed.
 * @returns Kind.
 */
function solidScriptFlowListKind(pieces: readonly string[]): string {
  const numbers = pieces.every((piece) => solidScriptValueNumber(piece.trim()) !== undefined);
  return numbers && pieces.length <= 3 ? 'Vector' : 'List';
}

/**
 * Tells the kinds one value typed without commas may hold: a [Name], a
 * bracketed list such as [1, 2, 3], a formula, a number or text.
 *
 * @param piece Value as typed.
 * @param head Kinds the script's names may hold.
 * @returns Kinds.
 */
function solidScriptFlowPieceKinds(piece: string, head: SolidScriptFlowHead): string[] {
  const text = piece.trim();
  if (text === '') return ['Text'];
  const inner = /^\[(.*)\]$/s.exec(text)?.[1];
  if (inner !== undefined && inner.trimStart().startsWith('=')) return solidScriptFlowFormulaKinds(inner, head);
  const items = inner === undefined ? [] : solidScriptFieldSplit(inner, ',');
  if (items.length > 1) return [solidScriptFlowListKind(items)];
  if (inner !== undefined && solidScriptFlowBalanced(inner)) return solidScriptFlowNameKinds(inner, head);
  return [solidScriptValueNumber(text) !== undefined ? 'Number' : 'Text'];
}

/**
 * Tells the kinds a value typed in a field may hold, the way a Set without a
 * Type reads it: commas typed outside brackets make a list (two or three
 * numbers a Vector), one value keeps its own kind.
 *
 * @param text Field text.
 * @param head Kinds the script's names may hold.
 * @returns Kinds.
 */
export function solidScriptFlowValueKinds(text: string, head: SolidScriptFlowHead): string[] {
  const pieces = solidScriptFieldSplit(text.trim(), ',');
  if (pieces.length > 1) return [solidScriptFlowListKind(pieces)];
  return solidScriptFlowPieceKinds(pieces[0] ?? '', head);
}

/**
 * Tells the kinds the items a For Each walks may hold: each typed item's kind,
 * or the item kind of the one list it is given.
 *
 * @param text List field text.
 * @param head Kinds the script's names may hold.
 * @returns Kinds.
 */
export function solidScriptFlowItemKinds(text: string, head: SolidScriptFlowHead): string[] {
  const pieces = solidScriptFieldSplit(text.trim(), ',');
  if (pieces.length > 1)
    return solidScriptFlowUnique(pieces.flatMap((piece) => solidScriptFlowPieceKinds(piece, head)));
  return solidScriptFlowUnique(solidScriptFlowPieceKinds(pieces[0] ?? '', head).map(solidScriptFlowItemOf));
}

/**
 * Tells the kinds a For Each Key may hold: text keys over Data, else numbers.
 *
 * @param text List field text.
 * @param head Kinds the script's names may hold.
 * @returns Kinds.
 */
export function solidScriptFlowKeyKinds(text: string, head: SolidScriptFlowHead): string[] {
  const kinds = solidScriptFlowValueKinds(text, head);
  return solidScriptFlowUnique(kinds.map((kind) => (kind === 'Data' ? 'Text' : 'Number')));
}
