import type { SolidScriptExpression } from './solid_script_ast.js';
import {
  solidScriptFieldEscapes,
  solidScriptFieldPieces,
  solidScriptFieldSpacesRead,
  solidScriptFieldSpacesWrite,
  type SolidScriptFieldKind,
} from './solid_script_field.js';
import { SolidScriptFormulaSource } from './solid_script_formula_source.js';

/** A plain number, such as -2 or 0.5. */
export const SOLID_SCRIPT_FORMULA_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** Field kinds whose commas are part of the text instead of parting a list. */
const SOLID_SCRIPT_FORMULA_TEXT_KINDS: readonly SolidScriptFieldKind[] = ['text', 'message', 'name', 'target'];

/**
 * Tells how many numbers a vector of a field kind has.
 *
 * @param kind Field kind.
 * @returns 3 or 2 for a vector field, 0 for any other.
 */
function solidScriptFormulaVectorSize(kind: SolidScriptFieldKind): number {
  return kind === 'vector3' ? 3 : kind === 'vector2' ? 2 : 0;
}

/**
 * Tells whether a field kind parts a list at its commas, such as 1, 2, 3.
 *
 * @param kind Field kind.
 * @returns True when commas part items.
 */
function solidScriptFormulaSplits(kind: SolidScriptFieldKind): boolean {
  return !SOLID_SCRIPT_FORMULA_TEXT_KINDS.includes(kind);
}

/**
 * Parts plain field text at its commas outside brackets; $, is a comma inside
 * an item.
 *
 * @param text Field text.
 * @returns Items as typed, or null when one is empty.
 */
function solidScriptFormulaPlainItems(text: string): string[] | null {
  const items: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < text.length; index++) {
    if (solidScriptFieldEscapes(text, index)) index++;
    else if (text[index] === '[') depth++;
    else if (text[index] === ']') depth--;
    else if (text[index] === ',' && depth === 0) {
      items.push(text.slice(from, index).trim());
      from = index + 1;
    }
  }
  items.push(text.slice(from).trim());
  return items.some((item) => item === '') ? null : items;
}

/**
 * Tells whether field text is one bracketed part alone, such as [Width].
 *
 * @param text Field text, trimmed.
 * @returns True for one part.
 */
function solidScriptFormulaIsSlot(text: string): boolean {
  try {
    const pieces = solidScriptFieldPieces(text);
    return pieces.length === 1 && pieces[0]?.kind === 'group';
  } catch {
    return false;
  }
}

/**
 * Turns plain text with bracketed parts into a formula: words in quotes, and
 * words around parts joined with Str, such as Str("Hi ", [Name]).
 *
 * The spaces $ keeps at the start and the end are spaces in the words.
 *
 * @param typed Plain text.
 * @returns Formula, or null for a broken bracket.
 */
function solidScriptFormulaTextFromPlain(typed: string): string | null {
  const text = solidScriptFieldSpacesRead(typed);
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < text.length; index++) {
    if (solidScriptFieldEscapes(text, index)) index++;
    else if (text[index] === '[' && depth++ === 0) {
      if (index > from) parts.push(solidScriptFormulaPlainString(text.slice(from, index)));
      from = index;
    } else if (text[index] === ']' && --depth === 0) {
      parts.push(solidScriptFormulaSlotFormula(text.slice(from, index + 1)));
      from = index + 1;
    }
  }
  if (depth !== 0) return null;
  if (from < text.length) parts.push(solidScriptFormulaPlainString(text.slice(from)));
  return parts.length === 1 ? (parts[0] ?? null) : `Str(${parts.join(', ')})`;
}

/**
 * Writes words of plain field text as a formula string: $, becomes a comma and
 * a double quote $".
 *
 * @param words Words as typed in the field.
 * @returns Formula string.
 */
function solidScriptFormulaPlainString(words: string): string {
  return `"${words.replaceAll('$,', ',').replaceAll('"', '$"')}"`;
}

/**
 * Returns a bracketed part as it stands in a formula: [=formula] as its formula
 * in parentheses, any other part as it is.
 *
 * @param slot Bracketed part, such as [Name] or [=[Width] * 2].
 * @returns Formula.
 */
function solidScriptFormulaSlotFormula(slot: string): string {
  const inner = slot.slice(1, -1).trim();
  return inner.startsWith('=') ? inner.slice(1).trim() : slot;
}

/**
 * Turns one plain item into a formula: a number, a bracketed part, or text.
 *
 * @param item Item, trimmed.
 * @returns Formula, or null when it cannot be one.
 */
function solidScriptFormulaItemFromPlain(item: string): string | null {
  if (SOLID_SCRIPT_FORMULA_NUMBER.test(item)) return item;
  if (solidScriptFormulaIsSlot(item)) return solidScriptFormulaSlotFormula(item);
  return solidScriptFormulaTextFromPlain(item);
}

/**
 * Turns plain field text into the formula it stands for, so blocks can open it:
 * Subtractive as "Subtractive", 2, 2, 2 as [2, 2, 2], 0, [Y], 0 in a vector
 * field as Vector(0, [Y], 0), 1, 2 in a flat vector field as Vector(1, 2), Hi
 * [Name] as Str("Hi ", [Name]), and a list such as [0, 0, 0], [1, 0, 0] as
 * $[[0, 0, 0], [1, 0, 0]$].
 *
 * @param kind How the field reads its text.
 * @param text Field text, trimmed.
 * @returns Formula, or null when the text cannot be one.
 */
export function solidScriptFormulaFromPlain(kind: SolidScriptFieldKind, text: string): string | null {
  const items = solidScriptFormulaSplits(kind) ? solidScriptFormulaPlainItems(text) : [text];
  const formulas = items?.map(solidScriptFormulaItemFromPlain) ?? [null];
  if (!items || formulas.some((formula) => formula === null)) return null;
  const parts = formulas as string[];
  if (parts.length === 1) return parts[0] ?? null;
  if (parts.length === 3 && items.every((item) => SOLID_SCRIPT_FORMULA_NUMBER.test(item)))
    return `[${items.join(', ')}]`;
  if (parts.length === solidScriptFormulaVectorSize(kind)) return `Vector(${parts.join(', ')})`;
  return `$[${parts.join(', ')}$]`;
}

/**
 * Writes a text of a formula as plain field text, with commas escaped where
 * they part items. Escaped brackets, such as $[Box$], stay as they are.
 *
 * @param source Formula read.
 * @param node Text.
 * @param splits True when commas part items in the field.
 * @returns Plain text, or null when it would read back as something else.
 */
function solidScriptFormulaTextPlain(
  source: SolidScriptFormulaSource,
  node: SolidScriptExpression,
  splits: boolean,
): string | null {
  const raw = source.slice(node).slice(1, -1).replaceAll('$"', '"');
  if (/\$(?![[\]])|(?<!\$)[[\]]/.test(raw)) return null;
  return splits ? raw.replaceAll(',', '$,') : raw;
}

/**
 * Writes a Str call as the plain text it joins, such as Hi [Name] for Str("Hi
 * ", [Name]).
 *
 * @param source Formula read.
 * @param node Call.
 * @param splits True when commas part items in the field.
 * @returns Plain text, or null.
 */
function solidScriptFormulaJoinPlain(
  source: SolidScriptFormulaSource,
  node: Extract<SolidScriptExpression, { kind: 'call' }>,
  splits: boolean,
): string | null {
  const parts = node.args.map((arg) => {
    if (arg.value.kind === 'string') return solidScriptFormulaTextPlain(source, arg.value, splits);
    return source.slot(arg.value) ? source.slice(arg.value) : `[=${source.slice(arg.value)}]`;
  });
  return parts.some((part) => part === null) || node.args.some((arg) => arg.name !== null) ? null : parts.join('');
}

/**
 * Writes one part of a formula as plain field text: a number, a text, a
 * bracketed part, a Vector of numbers in brackets, words joined with Str, or
 * anything else as [=formula].
 *
 * @param source Formula read.
 * @param node Part.
 * @param splits True when commas part items in the field.
 * @param edges True when the part is the whole field, which keeps spaces at its
 *   start and end.
 * @returns Plain text, or null.
 */
function solidScriptFormulaItemPlain(
  source: SolidScriptFormulaSource,
  node: SolidScriptExpression,
  splits: boolean,
  edges = false,
): string | null {
  const text = source.slice(node);
  if (SOLID_SCRIPT_FORMULA_NUMBER.test(text.replace(/\s+/g, ''))) return text.replace(/\s+/g, '');
  if (node.kind === 'string') return solidScriptFormulaStringPlain(source, node, splits, edges);
  if (source.slot(node)) return text;
  if (node.kind === 'call' && /^vector$/i.test(node.name)) {
    const numbers = node.args.map((arg) => source.slice(arg.value).replace(/\s+/g, ''));
    if (numbers.every((number) => SOLID_SCRIPT_FORMULA_NUMBER.test(number))) return `[${numbers.join(', ')}]`;
  }
  if (node.kind === 'call' && node.name.toLowerCase() === 'str')
    return solidScriptFormulaPlainEdges(solidScriptFormulaJoinPlain(source, node, splits), edges);
  return `[=${text}]`;
}

/**
 * Writes a text of a formula as plain field text, unless the field would read
 * it as something else, such as a number.
 *
 * @param source Formula read.
 * @param node Text.
 * @param splits True when commas part items in the field.
 * @param edges True when the text is the whole field.
 * @returns Plain text, or null.
 */
function solidScriptFormulaStringPlain(
  source: SolidScriptFormulaSource,
  node: SolidScriptExpression,
  splits: boolean,
  edges: boolean,
): string | null {
  const plain = solidScriptFormulaPlainEdges(solidScriptFormulaTextPlain(source, node, splits), edges);
  return plain !== null && plain !== '' && !/^[-+.\d=]/.test(plain.trim()) ? plain : null;
}

/**
 * Keeps the spaces at the start and the end of plain text: written as $ and a
 * space each where the text is the whole field, and not plain at all in an item
 * of a list.
 *
 * @param plain Plain text, or null.
 * @param edges True when the text is the whole field.
 * @returns Plain text, or null.
 */
function solidScriptFormulaPlainEdges(plain: string | null, edges: boolean): string | null {
  if (plain === null || !/^ | $/.test(plain)) return plain;
  return edges ? solidScriptFieldSpacesWrite(plain) : null;
}

/**
 * Returns the items a formula lists as a plain list in this field: the inputs
 * of Vector in a vector field, or the items of a $[ ] list of two or more.
 *
 * @param node Formula as a whole.
 * @param kind How the field reads its text.
 * @returns Items, or null for no list.
 */
function solidScriptFormulaListItems(
  node: SolidScriptExpression,
  kind: SolidScriptFieldKind,
): SolidScriptExpression[] | null {
  if (node.kind === 'call' && /^vector$/i.test(node.name) && node.args.length === solidScriptFormulaVectorSize(kind))
    return node.args.every((arg) => arg.name === null) ? node.args.map((arg) => arg.value) : null;
  if (node.kind !== 'vector' || node.items.length < 2 || !solidScriptFormulaSplits(kind)) return null;
  return node.items.length === 3 && node.items.every((item) => item.kind === 'number') ? null : node.items;
}

/**
 * Writes a formula as the plain field text it stands for, the other way round
 * from solidScriptFormulaFromPlain: "Subtractive" as Subtractive, Vector(0,
 * [Y], 0) in a vector field as 0, [Y], 0, Str("Hi ", [Name]) as Hi [Name].
 *
 * @param kind How the field reads its text.
 * @param formula Formula, trimmed.
 * @returns Plain text, or null when the formula is more than a plain value.
 */
export function solidScriptFormulaToPlain(kind: SolidScriptFieldKind, formula: string): string | null {
  let source: SolidScriptFormulaSource;
  try {
    source = SolidScriptFormulaSource.read(formula);
  } catch {
    return null;
  }
  const splits = solidScriptFormulaSplits(kind);
  const items = solidScriptFormulaListItems(source.tree, kind);
  const node = source.tree;
  if (source.slot(node) && splits) return solidScriptFormulaSlotNumbers(source.slice(node));
  if (!items) return node.kind === 'string' || node.kind === 'call' ? solidScriptFormulaWhole(source, splits) : null;
  const plains = items.map((item) => solidScriptFormulaItemPlain(source, item, true));
  return plains.some((plain) => plain === null) ? null : plains.join(', ');
}

/**
 * Writes a bracketed part of numbers, such as [1, 2, 3], as the numbers.
 *
 * @param slot Bracketed part.
 * @returns Numbers parted by commas, or null for any other part.
 */
function solidScriptFormulaSlotNumbers(slot: string): string | null {
  const numbers = slot
    .slice(1, -1)
    .split(',')
    .map((part) => part.trim());
  const plain = numbers.length > 1 && numbers.every((part) => SOLID_SCRIPT_FORMULA_NUMBER.test(part));
  return plain ? numbers.join(', ') : null;
}

/**
 * Writes a formula of one text, or of words joined with Str, as plain text.
 *
 * @param source Formula read.
 * @param splits True when commas part items in the field.
 * @returns Plain text, or null.
 */
function solidScriptFormulaWhole(source: SolidScriptFormulaSource, splits: boolean): string | null {
  const node = source.tree;
  if (node.kind === 'call' && node.name.toLowerCase() !== 'str') return null;
  return solidScriptFormulaItemPlain(source, node, splits, true);
}
