import type { SolidScriptExpression } from './solid_script_ast.js';
import { SolidScriptFormulaSource } from './solid_script_formula_source.js';

/** How tightly each operator holds its sides; a higher level holds tighter. */
const SOLID_SCRIPT_FORMULA_LEVELS: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '^': 8,
};

/**
 * Level of a part nothing can split, such as a number, a call or a part in
 * parentheses.
 */
export const SOLID_SCRIPT_FORMULA_LEVEL_ATOM = 9;

/** Level of a part starting with !, - or +. */
export const SOLID_SCRIPT_FORMULA_LEVEL_UNARY = 7;

/**
 * Returns how tightly an operator holds its sides.
 *
 * @param operator Operator, such as &&.
 * @returns Level, from 1 for || to 8 for ^.
 */
export function solidScriptFormulaOperatorLevel(operator: string): number {
  return SOLID_SCRIPT_FORMULA_LEVELS[operator] ?? SOLID_SCRIPT_FORMULA_LEVEL_ATOM;
}

/**
 * Returns how tightly the outermost operator of a part holds it together: 0 for
 * a ? choice, an operator's level, or 9 for a part nothing splits.
 *
 * @param node Part.
 * @returns Level.
 */
export function solidScriptFormulaLevel(node: SolidScriptExpression): number {
  if (node.kind === 'ternary') return 0;
  if (node.kind === 'binary') return solidScriptFormulaOperatorLevel(node.operator);
  if (node.kind === 'unary') return SOLID_SCRIPT_FORMULA_LEVEL_UNARY;
  return SOLID_SCRIPT_FORMULA_LEVEL_ATOM;
}

/**
 * Returns the level of formula text, 9 when it is in parentheses as a whole.
 *
 * @param text Formula.
 * @returns Level, or -1 when the text cannot be read.
 */
function solidScriptFormulaTextLevel(text: string): number {
  try {
    const source = SolidScriptFormulaSource.read(text);
    if (source.parenthesized(source.tree)) return SOLID_SCRIPT_FORMULA_LEVEL_ATOM;
    return solidScriptFormulaLevel(source.tree);
  } catch {
    return -1;
  }
}

/**
 * Puts formula text in parentheses when it would otherwise come apart where it
 * goes, such as a || b inside an &&. Text ending in a // note gets a line
 * break, so what follows it is not part of the note.
 *
 * @param text Formula.
 * @param need Lowest level the place keeps together without parentheses.
 * @returns Text, in parentheses only when needed.
 */
export function solidScriptFormulaWrap(text: string, need: number): string {
  const trimmed = text.trim();
  const ended = /\/\/[^\n]*$/.test(trimmed) ? `${trimmed}\n` : trimmed;
  return solidScriptFormulaTextLevel(trimmed) < need ? `(${ended})` : ended;
}

/**
 * Returns the lowest level a part joined by an operator keeps without
 * parentheses: the first part keeps the operator's own level and the others one
 * tighter, so a - (b - c) keeps its parentheses; ^ is the other way round, so
 * (a ^ b) ^ c keeps them. One part alone may be anything.
 *
 * @param operator Operator, such as &&.
 * @param count Parts joined.
 * @param position Index of the part.
 * @returns Level.
 */
export function solidScriptFormulaOperandNeed(operator: string, count: number, position: number): number {
  if (count === 1) return 0;
  const level = solidScriptFormulaOperatorLevel(operator);
  const loose = operator === '^' ? position === count - 1 : position === 0;
  return loose ? level : level + 1;
}

/**
 * Joins parts with an operator, each in parentheses only when needed.
 *
 * @param operator Operator, such as &&.
 * @param parts Parts in order.
 * @returns Formula.
 */
export function solidScriptFormulaJoin(operator: string, parts: readonly string[]): string {
  return parts
    .map((part, index) => solidScriptFormulaWrap(part, solidScriptFormulaOperandNeed(operator, parts.length, index)))
    .join(` ${operator} `);
}
