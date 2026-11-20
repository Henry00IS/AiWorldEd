import {
  solidScriptFieldArguments,
  solidScriptFieldPieces,
  type SolidScriptFieldKind,
  type SolidScriptFieldPiece,
} from './solid_script_field.js';

/**
 * How a block input shows what it holds: a vector, a text, a variable or any
 * formula.
 */
export type SolidScriptFormulaInputKind = 'vector' | 'text' | 'variable' | 'any';

/** A variable name as typed without brackets, such as Width or $Face.Center. */
const SOLID_SCRIPT_FORMULA_NAME = /^\$?[A-Za-z_][\w.]*$/;

/** A plain number, such as -2 or 0.5. */
const SOLID_SCRIPT_FORMULA_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** Words that are plain text, such as Fully Inside. */
const SOLID_SCRIPT_FORMULA_WORDS = /^[A-Za-z][A-Za-z0-9 _-]*$/;

/** Text in double quotes with no quote or backslash inside. */
const SOLID_SCRIPT_FORMULA_QUOTED = /^"([^"\\]*)"$/;

/** A Vector call, such as Vector(0, 1, 0). */
const SOLID_SCRIPT_FORMULA_VECTOR_CALL = /^Vector\s*\(([\s\S]*)\)$/i;

/**
 * Tells whether text is a variable name as typed without brackets, such as
 * Width or $Face.Center.
 *
 * @param text Text.
 * @returns True for a name.
 */
export function solidScriptFormulaIsName(text: string): boolean {
  return SOLID_SCRIPT_FORMULA_NAME.test(text.trim());
}

/** Problem of field text the blocks cannot open. */
export const SOLID_SCRIPT_FORMULA_PLAIN_TEXT =
  'This field holds plain text, not a formula. Blocks open a formula, such as [=[Width] * 2].';

/**
 * Returns the one bracketed part field text is made of, with blank text around
 * it allowed.
 *
 * @param text Field text.
 * @returns Part, or null when the text is anything else.
 */
function solidScriptFormulaLone(text: string): Extract<SolidScriptFieldPiece, { kind: 'group' }> | null {
  try {
    const pieces = solidScriptFieldPieces(text).filter((piece) => piece.kind === 'group' || piece.text.trim() !== '');
    const only = pieces[0];
    return pieces.length === 1 && only?.kind === 'group' ? only : null;
  } catch {
    return null;
  }
}

/**
 * Returns the formula inside text that is one [=formula] alone.
 *
 * @param text Field text.
 * @returns Formula, or null when the text is not one [=formula].
 */
export function solidScriptFormulaUnwrap(text: string): string | null {
  const lone = solidScriptFormulaLone(text);
  if (!lone) return null;
  const inner = text.slice(lone.from + 1, lone.to - 1);
  return inner.trimStart().startsWith('=') ? inner.slice(inner.indexOf('=') + 1) : null;
}

/**
 * Takes the formula out of stored field text: a condition is a formula as a
 * whole; any other field holds one [=formula], one [Name], a number, or
 * nothing.
 *
 * @param kind How the field reads its text.
 * @param stored Stored field text.
 * @returns Formula.
 * @throws Error when the field holds plain text.
 */
export function solidScriptFormulaBody(kind: SolidScriptFieldKind, stored: string): string {
  if (kind === 'condition') return stored;
  const text = stored.trim();
  if (text === '' || SOLID_SCRIPT_FORMULA_NUMBER.test(text) || solidScriptFormulaLone(text))
    return solidScriptFormulaUnwrap(text) ?? text;
  throw new Error(SOLID_SCRIPT_FORMULA_PLAIN_TEXT);
}

/**
 * Stores a formula as field text. Text whose formula did not change stays as it
 * was; a condition keeps the formula as is; any other field wraps it in [= ]
 * unless it already is one bracketed part, so [=[=…]] never happens.
 *
 * @param kind How the field reads its text.
 * @param body Formula.
 * @param stored Field text before.
 * @returns Field text.
 */
export function solidScriptFormulaStore(kind: SolidScriptFieldKind, body: string, stored: string): string {
  if (solidScriptFormulaBodyOr(kind, stored) === body) return stored;
  if (kind === 'condition') return body;
  const text = body.trim();
  if (text === '' || SOLID_SCRIPT_FORMULA_NUMBER.test(text) || solidScriptFormulaLone(text)) return text;
  return `[=${text}]`;
}

/**
 * Takes the formula out of stored field text, or gives null for plain text.
 *
 * @param kind How the field reads its text.
 * @param stored Stored field text.
 * @returns Formula, or null.
 */
export function solidScriptFormulaBodyOr(kind: SolidScriptFieldKind, stored: string): string | null {
  try {
    return solidScriptFormulaBody(kind, stored);
  } catch {
    return null;
  }
}

/**
 * Shows the formula of a block input the way it is typed: a vector such as [5,
 * 7, 2] or Vector(5, 7, 2) as 5, 7, 2, and a text such as "Top" as Top.
 *
 * @param kind What the input holds.
 * @param formula Formula of the input.
 * @returns Shown text.
 */
export function solidScriptFormulaShown(kind: SolidScriptFormulaInputKind, formula: string): string {
  const text = formula.trim();
  if (kind === 'text') {
    const quoted = SOLID_SCRIPT_FORMULA_QUOTED.exec(text)?.[1];
    return quoted !== undefined && SOLID_SCRIPT_FORMULA_WORDS.test(quoted) ? quoted : text;
  }
  const lone = solidScriptFormulaLone(text);
  if (kind === 'variable' && lone && solidScriptFormulaUnwrap(text) === null) {
    const name = text.slice(lone.from + 1, lone.to - 1).trim();
    return SOLID_SCRIPT_FORMULA_NAME.test(name) ? name : text;
  }
  if (kind !== 'vector') return text;
  const inner = lone ? text.slice(lone.from + 1, lone.to - 1) : SOLID_SCRIPT_FORMULA_VECTOR_CALL.exec(text)?.[1];
  const parts = inner === undefined ? [] : solidScriptFieldArguments(inner);
  const numbers = parts.every((part) => SOLID_SCRIPT_FORMULA_NUMBER.test(part));
  return parts.length === 3 && (numbers || !lone) && parts.every(solidScriptFormulaPlainPart) ? parts.join(', ') : text;
}

/**
 * Tells whether a part of a vector is a number or a [Name], which reads the
 * same in brackets and in Vector().
 *
 * @param part Part, trimmed.
 * @returns True for a plain part.
 */
function solidScriptFormulaPlainPart(part: string): boolean {
  return SOLID_SCRIPT_FORMULA_NUMBER.test(part) || (solidScriptFormulaLone(part) !== null && !part.startsWith('[='));
}

/**
 * Turns typed text of a block input into its formula: one [=formula] gives its
 * formula, three values give [5, 7, 2] or Vector(…), words where a text goes
 * are put in quotes and a name where a variable goes in brackets.
 *
 * @param kind What the input holds.
 * @param shown Typed text.
 * @returns Formula.
 */
export function solidScriptFormulaTyped(kind: SolidScriptFormulaInputKind, shown: string): string {
  const text = (solidScriptFormulaUnwrap(shown) ?? shown).trim();
  if (kind === 'text') return SOLID_SCRIPT_FORMULA_WORDS.test(text) ? `"${text}"` : text;
  if (kind === 'variable' && SOLID_SCRIPT_FORMULA_NAME.test(text)) return `[${text}]`;
  if (solidScriptFormulaLone(text)) return text;
  const parts = solidScriptFieldArguments(text);
  if (parts.length !== 3 || parts.some((part) => part === '')) return text;
  return parts.every((part) => SOLID_SCRIPT_FORMULA_NUMBER.test(part))
    ? `[${parts.join(', ')}]`
    : `Vector(${parts.join(', ')})`;
}
