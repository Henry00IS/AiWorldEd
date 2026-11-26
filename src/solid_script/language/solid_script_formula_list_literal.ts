import type { SolidScriptFieldPiece } from './solid_script_field.js';
import { SolidScriptLexer, type SolidScriptToken } from './solid_script_lexer.js';

/** A bracketed part of field text, with where its brackets stand. */
type SolidScriptFieldGroup = Extract<SolidScriptFieldPiece, { kind: 'group' }>;

/**
 * Two or three items separated by commas, such as 20, 30 or 20, 30, 10: a
 * vector in brackets.
 */
const SOLID_SCRIPT_FIELD_VECTOR = /^([^,]+),([^,]+)(?:,([^,]+))?$/;

/** Stands for a bracketed part inside a bracket while its text is read. */
const SOLID_SCRIPT_LIST_LITERAL_PART = ' _ ';

/**
 * Reads the text of a bracket, with its inner brackets already put in, as a
 * vector when it is two or three numbers, such as [20, 30] or [20, 30, 10].
 *
 * @param text Bracket text.
 * @returns Vector as written, or null when it is not two or three numbers.
 */
export function solidScriptFieldVectorRead(text: string): number[] | null {
  const parts = SOLID_SCRIPT_FIELD_VECTOR.exec(text);
  if (!parts) return null;
  const written = parts.slice(1).filter((part) => part !== undefined);
  const vector = written.map((part) => (part.trim() === '' ? NaN : Number(part)));
  return vector.every(Number.isFinite) ? vector : null;
}

/**
 * Tells whether a bracketed part inside a formula is a list written in
 * brackets, such as [0, [1, 1, 1], "Easy"], [], [0] or ["0"], rather than a
 * name: it is empty, has a comma outside its texts and round brackets, is one
 * number or one text, or holds nothing but another such list. No name can look
 * like that, while [Name] and [[Name]] stay names.
 *
 * @param group Bracketed part.
 * @returns True for a list.
 */
export function solidScriptFormulaListLiteral(group: SolidScriptFieldGroup): boolean {
  const meaningful = group.pieces.filter((piece) => piece.kind === 'group' || piece.text.trim() !== '');
  const only = meaningful[0];
  if (only === undefined) return true;
  if (meaningful.length === 1 && only.kind === 'group') return solidScriptFormulaListLiteral(only);
  if (only.kind === 'plain' && only.text.trimStart().startsWith('=')) return false;
  const tokens = solidScriptFormulaListTokens(group.pieces);
  return tokens !== null && (solidScriptFormulaListComma(tokens) || solidScriptFormulaListSingle(tokens));
}

/**
 * Tells whether a bracketed part inside a formula is a list the formula reads
 * itself: a list in brackets other than two or three plain numbers, which keep
 * being read as a vector the way every field reads them.
 *
 * @param group Bracketed part.
 * @returns True when the formula reads it as a list.
 */
export function solidScriptFormulaListInline(group: SolidScriptFieldGroup): boolean {
  if (!solidScriptFormulaListLiteral(group)) return false;
  if (!group.pieces.every((piece) => piece.kind === 'plain')) return true;
  return (
    solidScriptFieldVectorRead(group.pieces.map((piece) => (piece.kind === 'plain' ? piece.text : '')).join('')) ===
    null
  );
}

/**
 * Reads the text of a bracket the way a formula reads it, each inner bracketed
 * part standing as one name.
 *
 * @param pieces Contents of the brackets.
 * @returns Tokens without the end, or null when a formula cannot read them.
 */
function solidScriptFormulaListTokens(pieces: readonly SolidScriptFieldPiece[]): SolidScriptToken[] | null {
  const text = pieces.map((piece) => (piece.kind === 'plain' ? piece.text : SOLID_SCRIPT_LIST_LITERAL_PART)).join('');
  try {
    return new SolidScriptLexer(text).tokenize().filter((token) => token.kind !== 'end');
  } catch {
    return null;
  }
}

/**
 * Tells whether tokens have a comma outside round and square brackets.
 *
 * @param tokens Tokens.
 * @returns True when they do.
 */
function solidScriptFormulaListComma(tokens: readonly SolidScriptToken[]): boolean {
  let depth = 0;
  for (const token of tokens) {
    if (token.kind !== 'symbol') continue;
    if (token.text === '(' || token.text === '[') depth++;
    else if (token.text === ')' || token.text === ']') depth--;
    else if (token.text === ',' && depth === 0) return true;
  }
  return false;
}

/**
 * Tells whether tokens are one number, maybe with a sign, or one text.
 *
 * @param tokens Tokens.
 * @returns True when they are.
 */
function solidScriptFormulaListSingle(tokens: readonly SolidScriptToken[]): boolean {
  const [first, second] = tokens;
  if (tokens.length === 1) return first?.kind === 'number' || first?.kind === 'string';
  const signed = first?.kind === 'symbol' && (first.text === '-' || first.text === '+');
  return tokens.length === 2 && signed && second?.kind === 'number';
}

/**
 * Finds where each list in brackets of field text that a formula reads itself
 * starts, inside every [= ] formula, or anywhere when the whole text is a
 * formula.
 *
 * @param pieces Pieces of the field text.
 * @param formula True when the pieces stand inside a formula.
 * @returns Places of the [ of each such list.
 */
export function solidScriptFormulaListStarts(pieces: readonly SolidScriptFieldPiece[], formula: boolean): Set<number> {
  const starts = new Set<number>();
  const walk = (list: readonly SolidScriptFieldPiece[], inside: boolean): void => {
    for (const piece of list) {
      if (piece.kind === 'plain') continue;
      const first = piece.pieces[0];
      const opens = first?.kind === 'plain' && first.text.trimStart().startsWith('=');
      const inline = inside && !opens && solidScriptFormulaListInline(piece);
      if (inline) starts.add(piece.from);
      walk(piece.pieces, opens || inline);
    }
  };
  walk(pieces, formula);
  return starts;
}

/**
 * Writes a list in a formula from the formulas of its items: in brackets, such
 * as [1, "a", [X]] or [], or as List(...) for one item that brackets alone
 * would read as a name, such as List([X]).
 *
 * @param items Formulas of the items.
 * @returns Formula of the list.
 */
export function solidScriptFormulaListWrite(items: readonly string[]): string {
  const [only] = items;
  if (items.length !== 1 || only === undefined) return `[${items.join(', ')}]`;
  const tokens = solidScriptFormulaListTokens([{ kind: 'plain', text: only }]);
  return tokens !== null && solidScriptFormulaListSingle(tokens) ? `[${only}]` : `List(${only})`;
}
