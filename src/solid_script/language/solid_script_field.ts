import type { SolidScriptValue } from './solid_script_value.js';
import { solidScriptValueText } from './solid_script_value.js';

/**
 * How the text typed into a block field is read. Field text is plain text
 * without quotes: [name] puts in the value of a variable, [=formula] the result
 * of a formula, and $ before a character keeps it as typed, so $[ and $] write
 * brackets and $$ a dollar sign. Brackets may nest, so a variable name or a
 * formula can itself be built from variables.
 */
export type SolidScriptFieldKind =
  | 'number'
  | 'count'
  | 'vector2'
  | 'vector3'
  | 'points2'
  | 'points3'
  | 'boolean'
  | 'value'
  | 'condition'
  | 'message'
  | 'name'
  | 'target'
  | 'text';

/** What resolving field text needs from the running script. */
export interface SolidScriptFieldContext {
  /** Returns a variable's value; throws when there is none. */
  variable(name: string): SolidScriptValue;
  /** Computes a formula; throws when it cannot be read. */
  formula(text: string): SolidScriptValue;
}

/** One piece of field text: plain characters or a bracketed part. */
type SolidScriptFieldPiece = { kind: 'plain'; text: string } | { kind: 'group'; pieces: SolidScriptFieldPiece[] };

/** Field kinds whose text is used exactly as typed. */
const SOLID_SCRIPT_FIELD_KINDS_RAW: ReadonlySet<SolidScriptFieldKind> = new Set(['name', 'target', 'text']);

/**
 * Splits field text into plain characters and bracketed parts.
 *
 * @param text Field text.
 * @returns Pieces.
 */
function solidScriptFieldPieces(text: string): SolidScriptFieldPiece[] {
  const root: SolidScriptFieldPiece[] = [];
  const open: SolidScriptFieldPiece[][] = [root];
  const plain = (character: string): void => {
    const into = open[open.length - 1]!;
    const last = into[into.length - 1];
    if (last?.kind === 'plain') last.text += character;
    else into.push({ kind: 'plain', text: character });
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === '$') {
      const next = text[index + 1];
      if (next === undefined) throw new Error('a $ at the end has nothing to keep; write $$ for a dollar sign');
      plain(next);
      index++;
    } else if (character === '[') {
      const group: SolidScriptFieldPiece = { kind: 'group', pieces: [] };
      open[open.length - 1]!.push(group);
      open.push(group.pieces);
    } else if (character === ']') {
      if (open.length === 1) throw new Error('a ] has no [ before it; write $] for a bracket');
      open.pop();
    } else plain(character);
  }
  if (open.length > 1) throw new Error('a [ has no ] after it; write $[ for a bracket');
  return root;
}

/**
 * Writes a value so a formula reads it back unchanged.
 *
 * @param value Value.
 * @returns Formula text.
 */
function solidScriptFieldFormulaText(value: SolidScriptValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return value < 0 ? `(${value})` : String(value);
  if (Array.isArray(value)) return `[${value.map(solidScriptFieldFormulaText).join(', ')}]`;
  return solidScriptValueText(value);
}

/**
 * Resolves a bracketed part: a formula after =, otherwise a variable name.
 * Parts inside it are resolved first.
 *
 * @param pieces Contents of the brackets.
 * @param context Running script.
 * @returns Value.
 */
function solidScriptFieldGroup(
  pieces: readonly SolidScriptFieldPiece[],
  context: SolidScriptFieldContext,
): SolidScriptValue {
  const first = pieces[0];
  const formula = first?.kind === 'plain' && first.text.trimStart().startsWith('=');
  let inner = '';
  for (const piece of pieces) {
    if (piece.kind === 'plain') inner += piece.text;
    else {
      const value = solidScriptFieldGroup(piece.pieces, context);
      inner += formula ? solidScriptFieldFormulaText(value) : solidScriptValueText(value);
    }
  }
  if (formula) {
    const body = inner.trimStart().slice(1).trim();
    if (body === '') throw new Error('[=] has no formula after the =');
    return context.formula(body);
  }
  const name = inner.trim();
  if (name === '') throw new Error('[] is empty; put a variable name inside, or write $[$] for brackets');
  return context.variable(name);
}

/**
 * Resolves field text: one bracketed part alone keeps its value, anything else
 * becomes text with every bracketed part put in.
 *
 * @param text Field text.
 * @param context Running script.
 * @returns Value or text.
 */
function solidScriptFieldTemplate(text: string, context: SolidScriptFieldContext): SolidScriptValue {
  const pieces = solidScriptFieldPieces(text);
  const meaningful = pieces.filter((piece) => piece.kind === 'group' || piece.text.trim() !== '');
  if (meaningful.length === 1 && meaningful[0]!.kind === 'group')
    return solidScriptFieldGroup(meaningful[0]!.pieces, context);
  return pieces
    .map((piece) =>
      piece.kind === 'plain' ? piece.text : solidScriptValueText(solidScriptFieldGroup(piece.pieces, context)),
    )
    .join('');
}

/**
 * Splits field text at a separator outside brackets, keeping escapes as typed.
 *
 * @param text Field text.
 * @param separator Separator character.
 * @returns Items, trimmed.
 */
export function solidScriptFieldSplit(text: string, separator: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '$') index++;
    else if (character === '[') depth++;
    else if (character === ']') depth--;
    else if (character === separator && depth === 0) {
      items.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(text.slice(start).trim());
  return items;
}

/**
 * Reads plain text as a number when it is one.
 *
 * @param value Resolved value.
 * @returns Number, or the value unchanged.
 */
function solidScriptFieldNumber(value: SolidScriptValue): SolidScriptValue {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  const number = text === '' ? NaN : Number(text);
  return Number.isFinite(number) ? number : value;
}

/**
 * Reads a list field: items separated by commas, each a number, a variable or a
 * formula. A single bracketed part may also give the whole list.
 *
 * @param text Field text.
 * @param context Running script.
 * @returns Value.
 */
function solidScriptFieldVector(text: string, context: SolidScriptFieldContext): SolidScriptValue {
  const items = solidScriptFieldSplit(text, ',');
  if (items.length === 1) return solidScriptFieldNumber(solidScriptFieldTemplate(items[0]!, context));
  return items.map((item) => solidScriptFieldNumber(solidScriptFieldTemplate(item, context)));
}

/**
 * Reads a switch: Yes or No, or true or false.
 *
 * @param value Resolved value.
 * @returns Value.
 */
function solidScriptFieldBoolean(value: SolidScriptValue): SolidScriptValue {
  if (typeof value !== 'string') return value;
  const text = value.trim().toLowerCase();
  if (text === 'yes' || text === 'true') return true;
  if (text === 'no' || text === 'false') return false;
  return value;
}

/**
 * Reads the value of a Set line: a number, a list of numbers separated by
 * commas, Yes/No, or else the text as typed.
 *
 * @param text Field text.
 * @param context Running script.
 * @returns Value.
 */
function solidScriptFieldAny(text: string, context: SolidScriptFieldContext): SolidScriptValue {
  const items = solidScriptFieldSplit(text, ',');
  if (items.length > 1) {
    const values = items.map((item) => solidScriptFieldNumber(solidScriptFieldTemplate(item, context)));
    if (values.every((value) => typeof value === 'number')) return values;
  }
  const value = solidScriptFieldTemplate(text, context);
  const number = solidScriptFieldNumber(value);
  if (typeof number === 'number') return number;
  const flag = typeof value === 'string' ? solidScriptFieldBoolean(value) : value;
  return flag;
}

/**
 * Resolves the text of one block field into the value the block uses.
 *
 * @param kind How the field reads its text.
 * @param text Field text.
 * @param context Running script.
 * @returns Value.
 */
export function solidScriptFieldResolve(
  kind: SolidScriptFieldKind,
  text: string,
  context: SolidScriptFieldContext,
): SolidScriptValue {
  if (SOLID_SCRIPT_FIELD_KINDS_RAW.has(kind)) return text;
  switch (kind) {
    case 'number':
    case 'count':
      return solidScriptFieldNumber(solidScriptFieldTemplate(text, context));
    case 'vector2':
    case 'vector3':
      return solidScriptFieldVector(text, context);
    case 'points2':
    case 'points3': {
      if (text.trim() === '') return [];
      const points = solidScriptFieldSplit(text, ';');
      if (points.length === 1) return solidScriptFieldVector(points[0]!, context);
      return points.map((point) => solidScriptFieldVector(point, context));
    }
    case 'boolean':
      return solidScriptFieldBoolean(solidScriptFieldTemplate(text, context));
    case 'condition':
      return solidScriptFieldGroup([{ kind: 'plain', text: '=' }, ...solidScriptFieldPieces(text)], context);
    case 'message':
      return solidScriptValueText(solidScriptFieldTemplate(text, context));
    default:
      return solidScriptFieldAny(text, context);
  }
}

/**
 * Checks the brackets and escapes of field text without running it.
 *
 * @param text Field text.
 * @returns Problem, or an empty string.
 */
export function solidScriptFieldCheck(text: string): string {
  try {
    solidScriptFieldPieces(text);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Returns whether field text is one variable alone, such as [width].
 *
 * @param text Field text.
 * @returns True for a lone variable.
 */
export function solidScriptFieldIsVariable(text: string): boolean {
  return /^\[\s*(local\.|persistent\.)?[A-Za-z_]\w*(\s*\([^[\]]*\)(\s*\.\s*\w+)?)?\s*\]$/.test(text.trim());
}
