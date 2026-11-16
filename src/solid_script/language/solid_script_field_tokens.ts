import { solidScriptFunctionKey, solidScriptNameKey } from './solid_script_name_key.js';
import { SOLID_SCRIPT_SYSTEM_VALUES } from './solid_script_name_rules.js';

/**
 * What one piece of field text is, for its colour: plain text, a bracket, a
 * name of the script, a Function's own Local. name, a Persistent. name, a
 * built-in value, a function call, a number, a "text", an operator or a word
 * such as true.
 */
export type SolidScriptFieldTokenKind =
  | 'text'
  | 'bracket'
  | 'name'
  | 'local'
  | 'persistent'
  | 'system'
  | 'function'
  | 'number'
  | 'string'
  | 'operator'
  | 'keyword';

/** One piece of field text. */
export interface SolidScriptFieldToken {
  /** What it is. */
  kind: SolidScriptFieldTokenKind;
  /** Index of its first character. */
  from: number;
  /** Index after its last character. */
  to: number;
  /** Index of the matching bracket token, or -1. */
  pair: number;
  /**
   * True for a name or call whose existence can be checked: [Name] or
   * Spot(...).
   */
  checked: boolean;
}

/** Words a formula reads as values or operators, not as names. */
const SOLID_SCRIPT_FIELD_KEYWORDS = new Set(['true', 'false', 'undef', 'pi', 'and', 'or', 'not', 'for']);

/** Built-in value names such as face.center, in lower case. */
const SOLID_SCRIPT_FIELD_SYSTEM = new Set(
  Object.entries(SOLID_SCRIPT_SYSTEM_VALUES).flatMap(([group, members]) =>
    members.map((member) => `${group}.${member}`.toLowerCase()),
  ),
);

/** A name, with dotted parts such as Local.Width or Pos.x. */
const SOLID_SCRIPT_FIELD_WORD = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*/;

/** A number in a formula. */
const SOLID_SCRIPT_FIELD_NUMBER = /^(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/;

/** A whole number or decimal standing alone in plain text. */
const SOLID_SCRIPT_FIELD_PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/** One open bracket while reading. */
interface SolidScriptFieldOpen {
  /** Index of its token. */
  token: number;
  /** Character that closes it. */
  close: string;
  /** How text inside it is read. */
  mode: 'name' | 'formula';
}

/**
 * Names the kind of a word: Local. and Persistent. names, built-in values such
 * as Face.Center (with an optional .x part), or a name of the script.
 *
 * @param word Word as written.
 * @returns Kind.
 */
function solidScriptFieldWordKind(word: string): SolidScriptFieldTokenKind {
  const lower = word.toLowerCase();
  if (lower.startsWith('local.')) return 'local';
  if (lower.startsWith('persistent.')) return 'persistent';
  if (SOLID_SCRIPT_FIELD_SYSTEM.has(lower.replace(/\.[xyz]$/, ''))) return 'system';
  return 'name';
}

/**
 * Splits field text into pieces the way fields read it: [name] and [=formula]
 * brackets that nest, $ keeping the next character as typed, and inside a
 * formula numbers, "texts", names, calls and operators. Each bracket knows its
 * partner, so the editor can show which ones the caret is inside. Broken text
 * still splits; what cannot be read stays plain.
 *
 * @param text Field text.
 * @returns Pieces in order, covering the whole text.
 */
export function solidScriptFieldTokens(text: string): SolidScriptFieldToken[] {
  const tokens: SolidScriptFieldToken[] = [];
  const open: SolidScriptFieldOpen[] = [];
  const push = (kind: SolidScriptFieldTokenKind, from: number, to: number, checked = false): number => {
    const last = tokens.at(-1);
    if (kind === 'text' && last?.kind === 'text' && last.to === from) last.to = to;
    else tokens.push({ kind, from, to, pair: -1, checked });
    return tokens.length - 1;
  };
  const close = (index: number, char: string): boolean => {
    const at = open.map((entry) => entry.close).lastIndexOf(char);
    if (at < 0 || (char !== ']' && at !== open.length - 1)) return false;
    const entry = open[at]!;
    open.length = at;
    const token = push('bracket', index, index + 1);
    tokens[entry.token]!.pair = token;
    tokens[token]!.pair = entry.token;
    return true;
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    const mode = open.at(-1)?.mode ?? 'text';
    const rest = text.slice(index);
    if (char === '$') {
      const end = Math.min(text.length, index + 2);
      push('text', index, end);
      index = end;
      continue;
    }
    if (char === '[') {
      const formula = text[index + 1] === '=';
      const token = push('bracket', index, index + (formula ? 2 : 1));
      open.push({ token, close: ']', mode: formula ? 'formula' : 'name' });
      index += formula ? 2 : 1;
      continue;
    }
    if ((char === ']' || char === ')' || char === '}') && mode !== 'text' && close(index, char)) {
      index += 1;
      continue;
    }
    if (mode === 'text') {
      // Commas and semicolons part list items and points, so each number shows.
      const word = /^[^[$\s',;]+/.exec(rest)?.[0] ?? char;
      push(SOLID_SCRIPT_FIELD_PLAIN_NUMBER.test(word) ? 'number' : 'text', index, index + word.length);
      index += word.length;
      continue;
    }
    if (char === '(' || char === '{') {
      open.push({ token: push('bracket', index, index + 1), close: char === '(' ? ')' : '}', mode });
      index += 1;
      continue;
    }
    if (mode === 'formula' && char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      push('string', index, Math.min(text.length, end + 1));
      index = Math.min(text.length, end + 1);
      continue;
    }
    const number = SOLID_SCRIPT_FIELD_NUMBER.exec(rest)?.[0];
    if (number && !/^[A-Za-z_]/.test(rest.slice(number.length))) {
      push('number', index, index + number.length);
      index += number.length;
      continue;
    }
    const word = SOLID_SCRIPT_FIELD_WORD.exec(rest)?.[0];
    if (word) {
      const after = text.slice(index + word.length).trimStart();
      const previous = tokens.at(-1);
      // A whole [Name], [Name(2)] or [Pos.x]; names built from other names are not checked.
      const first =
        previous?.kind === 'bracket' &&
        previous.to === index &&
        text[previous.from] === '[' &&
        /[\]()]/.test(text.charAt(index + word.length));
      if (mode === 'name') push(solidScriptFieldWordKind(word), index, index + word.length, first);
      else if (SOLID_SCRIPT_FIELD_KEYWORDS.has(word.toLowerCase())) push('keyword', index, index + word.length);
      else if (after.startsWith('(') && !word.includes('.')) push('function', index, index + word.length, true);
      else {
        const kind = solidScriptFieldWordKind(word);
        push(kind, index, index + word.length, kind === 'local');
      }
      index += word.length;
      continue;
    }
    push(mode === 'formula' && !/[\s,;]/.test(char) ? 'operator' : 'text', index, index + 1);
    index += 1;
  }
  return tokens;
}

/**
 * Finds the brackets the caret is inside, every level of them, with their
 * partners.
 *
 * @param tokens Pieces of the field.
 * @param caret Caret index.
 * @returns Token indexes of the brackets around the caret.
 */
export function solidScriptFieldBracketsAround(tokens: readonly SolidScriptFieldToken[], caret: number): number[] {
  const around: number[] = [];
  tokens.forEach((token, index) => {
    if (token.kind !== 'bracket' || (token.pair !== -1 && token.pair < index)) return;
    const partner = tokens[token.pair];
    if (token.to <= caret && (!partner || caret <= partner.from)) around.push(index, ...(partner ? [token.pair] : []));
  });
  return around;
}

/**
 * Returns what a checked name or call is looked up by: the name's key without a
 * vector part such as .x, or a Function's key followed by ().
 *
 * @param text Field text.
 * @param token Piece of it.
 * @returns Key, or null for pieces that are not checked.
 */
export function solidScriptFieldTokenKey(text: string, token: SolidScriptFieldToken): string | null {
  if (!token.checked) return null;
  const written = text.slice(token.from, token.to);
  if (token.kind === 'function') return `${solidScriptFunctionKey(written)}()`;
  return token.kind === 'name' || token.kind === 'local'
    ? solidScriptNameKey(written.replace(/\.[xyzXYZ]$/, ''))
    : null;
}
