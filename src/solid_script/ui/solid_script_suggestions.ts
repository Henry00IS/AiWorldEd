import type { SolidScriptCommandWord } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptName } from '@/solid_script/document/solid_script_document_names.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  type SolidScriptFunctionArgument,
  solidScriptFunctionArguments,
} from '@/solid_script/language/solid_script_function_docs.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from '@/solid_script/language/solid_script_functions_builtin.js';
import { SolidScriptLexer, type SolidScriptToken } from '@/solid_script/language/solid_script_lexer.js';
import { solidScriptFunctionSpelling } from '@/solid_script/language/solid_script_name_key.js';
import { SOLID_SCRIPT_SYSTEM_GLOBALS } from '@/solid_script/language/solid_script_system.js';

/**
 * What the caret is in: one of a field's words, a [name], or a [= formula where
 * values and functions are written bare.
 */
export type SolidScriptSuggestionKind = 'word' | 'name' | 'formula';

/** The function call the caret is in, and which of its inputs it is at. */
export interface SolidScriptSuggestionCall {
  /** Function name as typed. */
  name: string;
  /** 0-based input the caret is at. */
  argument: number;
}

/** What is being typed at the caret, and where it starts. */
export interface SolidScriptSuggestionContext {
  /** What the caret is in. */
  kind: SolidScriptSuggestionKind;
  /** Index of the first character a pick replaces. */
  from: number;
  /** Typed start of the word or name. */
  prefix: string;
  /** Call around the caret inside a formula, or null. */
  call: SolidScriptSuggestionCall | null;
}

/** What a field may be filled with. */
export interface SolidScriptSuggestionScope {
  /** Names the script defines. */
  names: readonly SolidScriptName[];
  /** Names the command fills in itself, such as x for Displace. */
  extra: readonly string[];
  /** Words the field takes, offered first. */
  words: readonly SolidScriptCommandWord[];
}

/** How a suggestion is written: as the whole field, as a value or as a call. */
export type SolidScriptSuggestionPick = 'word' | 'value' | 'function';

/** One suggestion: what it shows and how it is written. */
export interface SolidScriptSuggestion {
  /** Shown name, written as it is. */
  label: string;
  /** Kind and description, shown dimmed. */
  detail: string;
  /** Group heading it is listed under. */
  category: string;
  /** How it is written. */
  pick: SolidScriptSuggestionPick;
  /** Other spelling it is found by, such as pad_left for PadLeft. */
  alias?: string;
}

/** Field text after a pick, with the caret. */
export interface SolidScriptSuggestionWritten {
  /** New field text. */
  text: string;
  /** Caret index. */
  caret: number;
}

/** Groups in listing order: words first, then values, then functions. */
const SOLID_SCRIPT_SUGGESTION_GROUPS = [
  'Choices',
  'Inputs',
  'Variables',
  'Lists',
  'Counters',
  'Locals',
  'Persistent',
  'System',
  'This Command',
  'Functions',
  'Built-In Functions',
];

/** Name categories that are not values a field reads. */
const SOLID_SCRIPT_SUGGESTION_NOT_VALUES = new Set(['Functions', 'Parts', 'Shapes', 'Handlers']);

/** Most suggestions listed at the caret at once. */
const SOLID_SCRIPT_SUGGESTIONS_MAX = 200;

/** What may follow [ while a name is typed. */
const SOLID_SCRIPT_SUGGESTION_BRACKET =
  /^(?:(?:Local|Persistent)\.)?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]*)?$|^(?:Local|Persistent)\.$/i;

/** Name being typed at the end of a formula. */
const SOLID_SCRIPT_SUGGESTION_TAIL = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]*)?$/;

/**
 * Finds the brackets still open before the caret, skipping $ escapes.
 *
 * @param before Field text before the caret.
 * @returns Open brackets, innermost last.
 */
function solidScriptSuggestionBrackets(before: string): { start: number; formula: boolean }[] {
  const open: { start: number; formula: boolean }[] = [];
  for (let index = 0; index < before.length; index++) {
    const char = before[index];
    if (char === '$') index += 1;
    else if (char === '[') open.push({ start: index, formula: before[index + 1] === '=' });
    else if (char === ']') open.pop();
  }
  return open;
}

/**
 * Finds the call a formula's caret is in from its tokens.
 *
 * @param tokens Tokens of the formula before the caret.
 * @returns Call, or null outside calls and inside [ ] or { }.
 */
function solidScriptSuggestionCallFind(tokens: readonly SolidScriptToken[]): SolidScriptSuggestionCall | null {
  const frames: (SolidScriptSuggestionCall | null)[] = [];
  tokens.forEach((token, index) => {
    if (token.kind !== 'symbol') return;
    const previous = tokens[index - 1];
    if (token.text === '(') frames.push(previous?.kind === 'identifier' ? { name: previous.text, argument: 0 } : null);
    else if (token.text === '[' || token.text === '{') frames.push(null);
    else if (token.text === ')' || token.text === ']' || token.text === '}') frames.pop();
    else if (token.text === ',') {
      const frame = frames.at(-1);
      if (frame) frame.argument += 1;
    }
  });
  return frames.at(-1) ?? null;
}

/**
 * Reads what is being typed at the caret with the formula tokenizer: a name
 * after [, a value or function inside a [= formula (and which call input it
 * is), or one of the field's words outside brackets.
 *
 * @param text Field text.
 * @param caret Caret index.
 * @param words True when the field takes one of a few words.
 * @returns Context, or null where nothing fits, such as right after a number.
 */
export function solidScriptSuggestionContext(
  text: string,
  caret: number,
  words: boolean,
): SolidScriptSuggestionContext | null {
  const before = text.slice(0, caret);
  const top = solidScriptSuggestionBrackets(before).at(-1);
  if (!top) return words ? { kind: 'word', from: 0, prefix: before.trim(), call: null } : null;
  if (!top.formula) {
    const prefix = before.slice(top.start + 1);
    if (prefix !== '' && !SOLID_SCRIPT_SUGGESTION_BRACKET.test(prefix)) return null;
    return { kind: 'name', from: top.start, prefix, call: null };
  }
  const formula = before.slice(top.start + 2);
  const prefix = SOLID_SCRIPT_SUGGESTION_TAIL.exec(formula)?.[0] ?? '';
  let tokens: SolidScriptToken[];
  try {
    tokens = new SolidScriptLexer(formula.slice(0, formula.length - prefix.length)).tokenize().slice(0, -1);
  } catch {
    return null;
  }
  const last = tokens.at(-1);
  // After a value an operator comes, not another value.
  if (last && (last.kind !== 'symbol' || last.text === ')' || last.text === ']' || last.text === '}')) return null;
  return { kind: 'formula', from: caret - prefix.length, prefix, call: solidScriptSuggestionCallFind(tokens) };
}

/**
 * Rates how well a name fits what is typed.
 *
 * @param suggestion Suggestion.
 * @param prefix Typed start, lower case.
 * @returns 0 when the name starts with it, 1 when a word of it does, 2 when it
 *   holds it, -1 when it does not fit.
 */
function solidScriptSuggestionRank(suggestion: SolidScriptSuggestion, prefix: string): number {
  if (prefix === '') return 0;
  const label = suggestion.label.toLowerCase();
  if (label.startsWith(prefix) || suggestion.alias?.startsWith(prefix)) return 0;
  const parts = suggestion.label.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[ ._]/);
  if (parts.some((part) => part.toLowerCase().startsWith(prefix))) return 1;
  return prefix.length >= 2 && label.includes(prefix) ? 2 : -1;
}

/**
 * Lists everything a field may be filled with, by group.
 *
 * @param scope What the field may refer to.
 * @returns Suggestions in group order.
 */
function solidScriptSuggestionsAll(scope: SolidScriptSuggestionScope): SolidScriptSuggestion[] {
  const all: SolidScriptSuggestion[] = [
    ...scope.words.map((word): SolidScriptSuggestion => ({
      ...word,
      label: word.word,
      category: 'Choices',
      pick: 'word',
    })),
    ...scope.names
      .filter((entry) => !SOLID_SCRIPT_SUGGESTION_NOT_VALUES.has(entry.category))
      .map((entry): SolidScriptSuggestion => ({
        label: entry.name,
        detail: entry.detail,
        category: entry.category,
        pick: 'value',
      })),
    ...SOLID_SCRIPT_SYSTEM_GLOBALS.map((value): SolidScriptSuggestion => ({
      label: value.name,
      detail: `${value.type}: ${value.detail}`,
      category: 'System',
      pick: 'value',
    })),
    ...scope.extra.map((name): SolidScriptSuggestion => ({
      label: name,
      detail: 'Filled in per point',
      category: 'This Command',
      pick: 'value',
    })),
    ...scope.names
      .filter((entry) => entry.category === 'Functions')
      .map((entry): SolidScriptSuggestion => ({
        label: entry.name,
        detail: entry.detail,
        category: 'Functions',
        pick: 'function',
      })),
    // Taught in PascalCase, such as PadLeft; any case still works.
    ...Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN)
      .sort()
      .map((name): SolidScriptSuggestion => {
        const doc = SOLID_SCRIPT_FUNCTION_DOCS[name];
        return {
          label: solidScriptFunctionSpelling(name),
          detail: doc ? `${doc.usage}: ${doc.summary}` : 'Built in',
          category: 'Built-In Functions',
          pick: 'function',
          alias: name,
        };
      }),
  ];
  return all
    .map((suggestion, index) => ({ suggestion, index }))
    .sort(
      (a, b) =>
        SOLID_SCRIPT_SUGGESTION_GROUPS.indexOf(a.suggestion.category) -
          SOLID_SCRIPT_SUGGESTION_GROUPS.indexOf(b.suggestion.category) || a.index - b.index,
    )
    .map(({ suggestion }) => suggestion);
}

/**
 * Lists what fits at the caret: a field's words while one is typed, otherwise
 * the matching values and then functions, each group with its best matches
 * first.
 *
 * @param context Typing context, or null where nothing is suggested.
 * @param scope What the field may refer to.
 * @returns Suggestions.
 */
export function solidScriptSuggestions(
  context: SolidScriptSuggestionContext | null,
  scope: SolidScriptSuggestionScope,
): SolidScriptSuggestion[] {
  if (!context) return [];
  const all = solidScriptSuggestionsAll(scope);
  const prefix = context.prefix.toLowerCase();
  if (context.kind === 'word') {
    const words = all.filter((entry) => entry.pick === 'word');
    // A word typed out in full still lists the others to switch to.
    if (words.some((entry) => entry.label.toLowerCase() === prefix)) return words;
    return words
      .map((entry) => ({ entry, rank: solidScriptSuggestionRank(entry, prefix) }))
      .filter(({ rank }) => rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .map(({ entry }) => entry);
  }
  return all
    .filter((entry) => entry.pick !== 'word')
    .map((entry, index) => ({ entry, index, rank: solidScriptSuggestionRank(entry, prefix) }))
    .filter(({ rank }) => rank >= 0)
    .sort(
      (a, b) =>
        SOLID_SCRIPT_SUGGESTION_GROUPS.indexOf(a.entry.category) -
          SOLID_SCRIPT_SUGGESTION_GROUPS.indexOf(b.entry.category) ||
        a.rank - b.rank ||
        a.index - b.index,
    )
    .map(({ entry }) => entry)
    .slice(0, SOLID_SCRIPT_SUGGESTIONS_MAX);
}

/**
 * The call the caret is in: the function, its inputs and which one is being
 * typed.
 */
export interface SolidScriptSuggestionHint {
  /** Name as the reference writes it, such as Clamp. */
  name: string;
  /** Inputs with display names, such as FromLow. */
  inputs: SolidScriptFunctionArgument[];
  /** Kind of value it gives. */
  gives: string;
  /** What it does, in one sentence. */
  summary: string;
  /** Index into inputs of the one being typed. */
  current: number;
}

/**
 * Finds the call the caret is in, built-in or a Function of this script, and
 * which input the caret is on.
 *
 * @param context Typing context.
 * @param scope What the field may refer to.
 * @returns Hint, or null outside a known call.
 */
export function solidScriptSuggestionHint(
  context: SolidScriptSuggestionContext | null,
  scope: SolidScriptSuggestionScope,
): SolidScriptSuggestionHint | null {
  const call = context?.call;
  if (!call) return null;
  const name = call.name.toLowerCase();
  const at = (inputs: SolidScriptFunctionArgument[]): number => Math.max(0, Math.min(call.argument, inputs.length - 1));
  const own = scope.names.find((entry) => entry.category === 'Functions' && entry.name.toLowerCase() === name);
  if (own) {
    const inside = /\((.*)\)/.exec(own.detail)?.[1]?.trim() ?? '';
    const inputs = (inside === '' ? [] : inside.split(',')).map((piece) => ({
      name: piece.trim(),
      type: 'Any',
      about: 'Input of this Function.',
    }));
    return { name: own.name, inputs, gives: 'Any', summary: 'Function of this script.', current: at(inputs) };
  }
  const key = Object.keys(SOLID_SCRIPT_FUNCTION_DOCS).find(
    (entry) => entry === name || solidScriptFunctionSpelling(entry).toLowerCase() === name,
  );
  const doc = key ? SOLID_SCRIPT_FUNCTION_DOCS[key] : undefined;
  if (!key || !doc) return null;
  const inputs = solidScriptFunctionArguments(key).map((input) => ({
    ...input,
    name: input.name === '...' ? input.name : solidScriptFunctionSpelling(input.name.replace(/ /g, '_')),
  }));
  return {
    name: solidScriptFunctionSpelling(key),
    inputs,
    gives: doc.gives,
    summary: doc.summary,
    current: at(inputs),
  };
}

/**
 * Writes one input of a hint as Name: Type.
 *
 * @param input Input.
 * @returns Text.
 */
export function solidScriptSuggestionHintInput(input: SolidScriptFunctionArgument): string {
  return `${input.name}: ${input.type}`;
}

/**
 * Writes the full signature of a hint, such as Clamp(Value: Number) -> Number.
 *
 * @param hint Hint.
 * @returns Signature text.
 */
export function solidScriptSuggestionHintSignature(hint: SolidScriptSuggestionHint): string {
  return `${hint.name}(${hint.inputs.map(solidScriptSuggestionHintInput).join(', ')}) -> ${hint.gives}`;
}

/**
 * Writes a pick into field text the way the caret position needs it: a word as
 * the whole field, a value as [Name] or bare inside a formula, a function as
 * [=Name()] or Name() inside a formula, replacing what was typed of it.
 *
 * @param suggestion Picked suggestion.
 * @param text Field text.
 * @param start Selection start.
 * @param end Selection end.
 * @returns New text and caret.
 */
export function solidScriptSuggestionWrite(
  suggestion: SolidScriptSuggestion,
  text: string,
  start: number,
  end: number,
): SolidScriptSuggestionWritten {
  if (suggestion.pick === 'word') return { text: suggestion.label, caret: suggestion.label.length };
  const context = start === end ? solidScriptSuggestionContext(text, start, false) : null;
  const call = suggestion.pick === 'function';
  let from = start;
  let after = text.slice(end);
  let insert = call ? `[=${suggestion.label}()]` : `[${suggestion.label}]`;
  let back = call ? 2 : 0;
  if (context?.kind === 'formula') {
    from = context.from;
    insert = call ? `${suggestion.label}()` : suggestion.label;
    back = call ? 1 : 0;
  } else if (context?.kind === 'name') {
    from = context.from;
    if (after.startsWith(']')) after = after.slice(1);
  }
  const written = text.slice(0, from) + insert;
  return { text: written + after, caret: written.length - back };
}
