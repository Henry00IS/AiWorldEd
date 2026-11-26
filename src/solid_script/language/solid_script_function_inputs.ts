import type { SolidScriptValue } from './solid_script_value.js';

/** One input of a Function line: its name and, when given, its default. */
export interface SolidScriptFunctionInput {
  name: string;
  /** Default as typed after =, or null when the input must be given. */
  fallback: string | null;
}

/**
 * Reads the Inputs field of a Function line, such as W, D = 1: names split by
 * commas outside brackets, each with an optional default after =.
 *
 * @param text Inputs field.
 * @returns Inputs in order, without empty ones.
 */
export function solidScriptFunctionInputs(text: string): SolidScriptFunctionInput[] {
  return solidScriptFunctionInputsSplit(text)
    .map((part) => {
      const equals = part.indexOf('=');
      if (equals < 0) return { name: part.trim(), fallback: null };
      return { name: part.slice(0, equals).trim(), fallback: part.slice(equals + 1).trim() };
    })
    .filter((input) => input.name !== '');
}

/**
 * Splits text at commas that are not inside brackets, parentheses or quotes.
 *
 * @param text Text.
 * @returns Parts.
 */
function solidScriptFunctionInputsSplit(text: string): string[] {
  const parts: string[] = [''];
  let depth = 0;
  let quoted = false;
  for (const letter of text) {
    if (letter === '"') quoted = !quoted;
    else if (!quoted && (letter === '[' || letter === '(')) depth++;
    else if (!quoted && (letter === ']' || letter === ')')) depth = Math.max(0, depth - 1);
    if (letter === ',' && depth === 0 && !quoted) parts.push('');
    else parts[parts.length - 1] += letter;
  }
  return parts;
}

/**
 * Reads a default as a value: a number, true or false, Yes or No, a quoted
 * text, a bracket list of those such as [1, 2], or else the text as typed.
 *
 * @param fallback Default as typed.
 * @returns Value.
 */
export function solidScriptFunctionInputDefault(fallback: string): SolidScriptValue {
  const text = fallback.trim();
  const folded = text.toLowerCase();
  if (folded === 'yes' || folded === 'true') return true;
  if (folded === 'no' || folded === 'false') return false;
  if (text !== '' && Number.isFinite(Number(text))) return Number(text);
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  if (text.startsWith('[') && text.endsWith(']')) {
    const items = solidScriptFunctionInputsSplit(text.slice(1, -1)).filter((item) => item.trim() !== '');
    return items.map(solidScriptFunctionInputDefault);
  }
  return fallback;
}
