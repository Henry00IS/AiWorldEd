import { solidScriptFieldSplit } from './solid_script_field.js';
import { solidScriptFieldVectorRead } from './solid_script_formula_list_literal.js';
import { solidScriptVectorOfNumbers, type SolidScriptVector3 } from './solid_script_vector.js';

/**
 * Reads one point written in brackets, such as [1, 2] or [1, 2, 3]; a point of
 * two numbers has a Z of 0.
 *
 * @param token Point text.
 * @returns X, Y and Z, or undefined when it is no point in brackets.
 */
export function solidScriptVectorTextPoint(token: string): SolidScriptVector3 | undefined {
  const trimmed = token.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return undefined;
  const written = solidScriptFieldVectorRead(trimmed.slice(1, -1));
  return written ? solidScriptVectorOfNumbers(written) : undefined;
}

/**
 * Splits a list of points written in brackets, such as [0, 1], [1, 0], into its
 * items; the outer brackets of a list, as Echo shows one, may be kept.
 *
 * @param text Points text.
 * @returns Items, trimmed.
 */
export function solidScriptVectorTextItems(text: string): string[] {
  const trimmed = text.trim();
  const body = trimmed.startsWith('[[') && trimmed.endsWith(']]') ? trimmed.slice(1, -1).trim() : trimmed;
  return solidScriptFieldSplit(body, ',').map((part) => part.trim());
}

/**
 * Reads points written in brackets, each of two or three numbers.
 *
 * @param items Point texts.
 * @returns Points, or null when any item is no point.
 */
export function solidScriptVectorTextPoints(items: readonly string[]): SolidScriptVector3[] | null {
  const points = items.map(solidScriptVectorTextPoint);
  return points.every((point) => point !== undefined) ? points : null;
}
