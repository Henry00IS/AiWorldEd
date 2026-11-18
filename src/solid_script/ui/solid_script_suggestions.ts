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
import { solidScriptSentence, solidScriptSentenceTyped } from '@/solid_script/language/solid_script_sentence.js';
import { solidScriptFieldEscapes, solidScriptFieldSplit } from '@/solid_script/language/solid_script_field.js';
import { solidScriptSystemIsVector } from '@/solid_script/language/solid_script_name_rules.js';
import {
  SOLID_SCRIPT_MEMBER_TYPES,
  solidScriptMemberNames,
  solidScriptMemberType,
} from '@/solid_script/language/solid_script_members.js';

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
  /**
   * Index after the last character a pick replaces: the whole word under the
   * caret.
   */
  to: number;
  /** The whole word or name under the caret, as if typed. */
  prefix: string;
  /** False right after a value, where only the call is explained. */
  offer: boolean;
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
  'Members',
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
const SOLID_SCRIPT_SUGGESTION_NOT_VALUES = new Set(['Functions', 'Parts', 'Brushes', 'Handlers']);

/** The system values as suggested: name, kind and what it holds. */
const SOLID_SCRIPT_SUGGESTION_SYSTEM: readonly (readonly [string, string, string])[] = [
  ['$Selected.Brushes', 'Brush List', 'the brushes lines below work on; every brush built so far until set'],
  ['$Selected.Faces', 'Face List', 'the faces the last Select Faces picked'],
  ['$Selected.Edges', 'Edge List', 'the edges set as selected'],
  ['$Selected.Vertices', 'Vertex List', 'the corners set as selected'],
  ...SOLID_SCRIPT_SYSTEM_GLOBALS.map((value) => [`$${value.name}`, value.type, value.detail] as const),
];

/** Most suggestions listed at the caret at once. */
const SOLID_SCRIPT_SUGGESTIONS_MAX = 200;

/** What may follow [ while a name is typed. */
const SOLID_SCRIPT_SUGGESTION_BRACKET =
  /^\$?(?:[A-Za-z_][A-Za-z0-9_]*(?:\([^()]*\))?(?:\.[A-Za-z0-9_]*(?:\([^()]*\))?)*)?$/;

/** Name being typed at the end of a formula. */
const SOLID_SCRIPT_SUGGESTION_TAIL = /\$?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]*)*$/;

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
    if (solidScriptFieldEscapes(before, index)) index += 1;
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
 * Finds the call around a spot of a formula.
 *
 * @param formula Formula text before the spot.
 * @returns Call, or null outside calls or when the text cannot be read.
 */
function solidScriptSuggestionCallAt(formula: string): SolidScriptSuggestionCall | null {
  try {
    return solidScriptSuggestionCallFind(new SolidScriptLexer(formula).tokenize().slice(0, -1));
  } catch {
    return null;
  }
}

/**
 * Reads the word under the caret with the formula tokenizer, as if it were
 * being typed: a name in [ ], a value or function inside a [= formula (and
 * which call input it is, also from inside a nested [name]), or the field's
 * word outside brackets. The whole word counts, also the part after the caret,
 * so a pick replaces all of it.
 *
 * @param text Field text.
 * @param caret Caret index.
 * @param words True when the field takes one of a few words.
 * @returns Context, or null where nothing fits, such as after a number outside
 *   a call.
 */
export function solidScriptSuggestionContext(
  text: string,
  caret: number,
  words: boolean,
): SolidScriptSuggestionContext | null {
  const before = text.slice(0, caret);
  const open = solidScriptSuggestionBrackets(before);
  const top = open.at(-1);
  if (!top)
    return words ? { kind: 'word', from: 0, to: text.length, prefix: text.trim(), offer: true, call: null } : null;
  const rest = /^[A-Za-z0-9_.]*/.exec(text.slice(caret))?.[0] ?? '';
  if (!top.formula) {
    const prefix = before.slice(top.start + 1) + rest;
    if (prefix !== '' && !SOLID_SCRIPT_SUGGESTION_BRACKET.test(prefix)) return null;
    const outer = open
      .slice(0, -1)
      .reverse()
      .find((entry) => entry.formula);
    const call = outer ? solidScriptSuggestionCallAt(before.slice(outer.start + 2, top.start)) : null;
    return { kind: 'name', from: top.start, to: caret + rest.length, prefix, offer: true, call };
  }
  const formula = before.slice(top.start + 2);
  const typed = SOLID_SCRIPT_SUGGESTION_TAIL.exec(formula)?.[0] ?? '';
  const prefix = typed + (typed === '' && !/^[A-Za-z_]/.test(rest) ? '' : rest);
  let tokens: SolidScriptToken[];
  try {
    tokens = new SolidScriptLexer(formula.slice(0, formula.length - typed.length)).tokenize().slice(0, -1);
  } catch {
    return null;
  }
  const call = solidScriptSuggestionCallFind(tokens);
  const last = tokens.at(-1);
  const from = caret - typed.length;
  const to = from + prefix.length;
  // After a value an operator comes, not another value: only the call is explained.
  if (last && (last.kind !== 'symbol' || last.text === ')' || last.text === ']' || last.text === '}'))
    return call ? { kind: 'formula', from: caret, to: caret, prefix: '', offer: false, call } : null;
  return { kind: 'formula', from, to, prefix, offer: true, call };
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
 * Describes a name of the script as a sentence, after its kind when that is
 * known, such as "Brush: What is made of **Cube**.".
 *
 * @param entry Name.
 * @param scope What the field may refer to.
 * @returns Description.
 */
function solidScriptSuggestionNameDetail(entry: SolidScriptName, scope: SolidScriptSuggestionScope): string {
  const typed = entry.category === 'Variables' || entry.category === 'Counters';
  const type = typed ? solidScriptSuggestionType(entry.name, scope) : null;
  return solidScriptSentenceTyped(type === null || type === 'List' ? '' : type, entry.detail);
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
      detail: solidScriptSentence(word.detail),
      label: word.word,
      category: 'Choices',
      pick: 'word',
    })),
    ...scope.names
      .filter((entry) => !SOLID_SCRIPT_SUGGESTION_NOT_VALUES.has(entry.category))
      .map((entry): SolidScriptSuggestion => ({
        label: entry.name,
        detail: solidScriptSuggestionNameDetail(entry, scope),
        category: entry.category,
        pick: 'value',
      })),
    ...SOLID_SCRIPT_SUGGESTION_SYSTEM.map(([label, type, detail]): SolidScriptSuggestion => ({
      label,
      detail: solidScriptSentenceTyped(type, detail),
      category: 'System',
      pick: 'value',
    })),
    ...scope.extra.map((name): SolidScriptSuggestion => ({
      label: name,
      detail: 'Filled in per point.',
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
          detail: doc ? `${doc.usage}: ${solidScriptSentence(doc.summary)}` : 'Built in.',
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
 * Categories of names that hold a value set by a line, whose kind its text
 * tells.
 */
const SOLID_SCRIPT_SUGGESTION_SET = new Set(['Variables', 'Locals', 'Persistent']);

/**
 * Tells how many axes a name's value has: a built-in vector, or a variable set
 * to a list of two or three parts or to a built-in vector.
 *
 * @param name Name as typed.
 * @param scope What the field may refer to.
 * @param depth How many variables deep a value naming another is followed.
 * @returns Axes, 0 for a known value that is no vector, or null for an unknown
 *   name.
 */
function solidScriptSuggestionAxes(name: string, scope: SolidScriptSuggestionScope, depth = 4): number | null {
  const system = solidScriptSystemIsVector(name);
  if (system !== null) return system ? 3 : 0;
  const key = name.toLowerCase();
  if (scope.names.some((entry) => entry.name.toLowerCase() === key && entry.detail === 'vector input')) return 3;
  const set = scope.names.find(
    (entry) => entry.name.toLowerCase() === key && SOLID_SCRIPT_SUGGESTION_SET.has(entry.category),
  );
  if (!set) return scope.names.some((entry) => entry.name.toLowerCase() === key) ? 0 : null;
  const value = /^set to (.*)$/s.exec(set.detail)?.[1]?.trim() ?? '';
  const parts = solidScriptFieldSplit(value, ',').length;
  if (parts === 2 || parts === 3) return parts;
  // A formula that makes a vector, such as [=Vector(1, 2, 3)] or [=[Pos] + Vector(0, 1, 0)].
  if (/^\[=.*\bvector\s*\(/is.test(value)) return 3;
  const named = /^\[([A-Za-z_][\w.]*)\]$/.exec(value)?.[1];
  if (named === undefined) return 0;
  return solidScriptSystemIsVector(named) === true
    ? 3
    : depth > 0
      ? (solidScriptSuggestionAxes(named, scope, depth - 1) ?? 0)
      : 0;
}

/**
 * Tells the kind a name of the script holds: the Type its Set declares, what
 * the line writing it gives, or a guess from the value it is set to or the list
 * a For Each walks. Guesses only drive suggestions, never results.
 *
 * @param key Name, lower case.
 * @param scope What the field may refer to.
 * @param depth How many names deep a value naming another is followed.
 * @returns Kind, or null when unknown.
 */
function solidScriptSuggestionNamed(key: string, scope: SolidScriptSuggestionScope, depth: number): string | null {
  const entry = scope.names.find((known) => known.name.toLowerCase() === key && (known.type || known.from));
  if (!entry) return null;
  if (entry.type) return entry.type;
  const path = /^\[([^=\]][^\]]*)\]$/.exec(entry.from?.text.trim() ?? '')?.[1];
  const type = path && depth > 0 ? solidScriptSuggestionType(path, scope, depth - 1) : null;
  if (!type || !entry.from?.item) return type;
  return type.endsWith(' List') ? type.slice(0, -' List'.length) : null;
}

/**
 * Tells the kind of value a typed name holds: a system value, a vector or a
 * list of the script, then each member after it, such as Face List for
 * $Selected.Faces and Vector for $Selected.Faces.First.Normal.
 *
 * @param name Name as typed, without a trailing dot.
 * @param scope What the field may refer to.
 * @returns Kind, or null when it is not known, such as for a variable a command
 *   writes.
 */
function solidScriptSuggestionType(name: string, scope: SolidScriptSuggestionScope, depth = 4): string | null {
  const parts = name.split('.');
  const item = (part: string) => /\(.*\)$/.test(part);
  const word = (part: string) => part.replace(/\s*\(.*\)$/, '');
  let type: string | null = null;
  let used = 1;
  if (name.startsWith('$')) {
    const two = `${word(parts[0]!)}.${word(parts[1] ?? '')}`.toLowerCase();
    type = SOLID_SCRIPT_SUGGESTION_SYSTEM.find(([label]) => label.toLowerCase() === two)?.[1] ?? null;
    used = 2;
    if (type && item(parts[1] ?? '')) type = type.endsWith(' List') ? type.slice(0, -' List'.length) : null;
  } else {
    const first = word(parts[0]!);
    const key = first.toLowerCase();
    // A declared Type or the list a For Each walks wins over guessing a vector from commas.
    type = solidScriptSuggestionNamed(key, scope, depth);
    if (type === null) {
      const axes = solidScriptSuggestionAxes(first, scope);
      if (axes !== null && axes > 0) type = 'Vector';
      else if (scope.names.some((entry) => entry.name.toLowerCase() === key && entry.category === 'Lists'))
        type = 'List';
    }
    if (type && item(parts[0]!)) type = type === 'List' ? 'Item' : null;
  }
  for (const part of parts.slice(used)) {
    if (type === null) return null;
    type =
      type === 'List'
        ? (SOLID_SCRIPT_MEMBER_TYPES['List']![word(part)] ?? null)
        : solidScriptMemberType(type, word(part));
    if (type === 'Item') type = null;
    if (type && item(part)) type = type.endsWith(' List') ? type.slice(0, -' List'.length) : null;
  }
  return type;
}

/**
 * Lists the members of what is typed before its last dot, such as the axes of a
 * vector, Count of a list or Normal of a face.
 *
 * @param prefix Typed name.
 * @param scope What the field may refer to.
 * @returns Members, or null when the start is no known value.
 */
function solidScriptSuggestionMembers(
  prefix: string,
  scope: SolidScriptSuggestionScope,
): SolidScriptSuggestion[] | null {
  const dot = prefix.lastIndexOf('.');
  if (dot < 0) return null;
  const base = prefix.slice(0, dot);
  // The values of a group of system values, such as $Selected.Faces.
  if (base.startsWith('$') && !base.includes('.')) {
    const group = SOLID_SCRIPT_SUGGESTION_SYSTEM.filter(([label]) =>
      label.toLowerCase().startsWith(`${base.toLowerCase()}.`),
    );
    if (group.length > 0)
      return group.map(([label, type, detail]) => ({
        label,
        detail: solidScriptSentenceTyped(type, detail),
        category: 'Members',
        pick: 'value',
      }));
  }
  const type = solidScriptSuggestionType(base, scope);
  if (type === null) return null;
  const names = type === 'List' ? Object.keys(SOLID_SCRIPT_MEMBER_TYPES['List']!) : solidScriptMemberNames(type);
  return names.map((name) => {
    const gives = type === 'List' ? (name === 'Count' ? 'Number' : 'Item') : solidScriptMemberType(type, name);
    return {
      label: `${base}.${name}`,
      detail:
        gives === 'Item' || gives === null
          ? `The ${name.toLowerCase()} item of ${base}.`
          : solidScriptSentenceTyped(gives, `the .${name} of ${base}`),
      category: 'Members',
      pick: 'value',
    };
  });
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
  if (!context?.offer) return [];
  const prefix = context.prefix.toLowerCase();
  const members = context.kind === 'word' ? null : solidScriptSuggestionMembers(context.prefix, scope);
  if (members) return members.filter((entry) => entry.label.toLowerCase().startsWith(prefix));
  const all = solidScriptSuggestionsAll(scope);
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
 * Picks the suggestion to start on: the one the field already holds, such as
 * the current word of a field of words, else the first.
 *
 * @param suggestions Listed suggestions.
 * @param context Typing context.
 * @returns Index.
 */
export function solidScriptSuggestionActive(
  suggestions: readonly SolidScriptSuggestion[],
  context: SolidScriptSuggestionContext | null,
): number {
  const typed = context?.prefix.toLowerCase() ?? '';
  return Math.max(
    0,
    suggestions.findIndex((entry) => entry.label.toLowerCase() === typed),
  );
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
    after = text.slice(context.to);
    // A call that already has its brackets keeps them.
    const called = call && after.startsWith('(');
    insert = call && !called ? `${suggestion.label}()` : suggestion.label;
    back = call && !called ? 1 : called ? -1 : 0;
  } else if (context?.kind === 'name') {
    from = context.from;
    after = text.slice(context.to);
    if (after.startsWith(']')) after = after.slice(1);
  }
  const written = text.slice(0, from) + insert;
  return { text: written + after, caret: written.length - back };
}
