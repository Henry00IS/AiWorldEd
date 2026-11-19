import type { SolidScriptCommandWord } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptName } from '@/solid_script/document/solid_script_document_names.js';
import {
  SOLID_SCRIPT_FLOW_UNKNOWN,
  solidScriptFlowPathKinds,
} from '@/solid_script/document/solid_script_document_flow_kinds.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  type SolidScriptFunctionArgument,
  solidScriptFunctionArguments,
  solidScriptFunctionKindsText,
} from '@/solid_script/language/solid_script_function_docs.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from '@/solid_script/language/solid_script_functions_builtin.js';
import { SolidScriptLexer, type SolidScriptToken } from '@/solid_script/language/solid_script_lexer.js';
import { solidScriptFunctionSpelling } from '@/solid_script/language/solid_script_name_key.js';
import { SOLID_SCRIPT_SYSTEM_LISTED } from '@/solid_script/language/solid_script_system.js';
import { solidScriptSystemFill } from '@/solid_script/language/solid_script_system_names.js';
import { solidScriptSystemFillEach } from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptSentence, solidScriptSentenceTyped } from '@/solid_script/language/solid_script_sentence.js';
import { solidScriptFieldEscapes } from '@/solid_script/language/solid_script_field.js';
import {
  SOLID_SCRIPT_SYSTEM_VALUES,
  solidScriptNameDotProblem,
} from '@/solid_script/language/solid_script_name_rules.js';
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
  /** Names the command fills in itself, such as $X for Displace. */
  extra: readonly string[];
  /** Words the field takes, offered first. */
  words: readonly SolidScriptCommandWord[];
  /**
   * True for a field holding a whole path a Set writes: after a dot it offers
   * the members that lead to a value a line can set.
   */
  paths?: boolean;
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
  /** True when this is a current-element name such as $Vertex or $Index. */
  each?: boolean;
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
 * Describes a name of the script by the writes that may reach where the line
 * stands, each after its kinds, such as "Brush: What is made of **Cube** (line
 * 3)."; else as a sentence after the kinds it may hold when they are known,
 * such as "Brush: What is made of **Cube**." or "Text or Brush: …".
 *
 * @param entry Name.
 * @param scope What the field may refer to.
 * @returns Description.
 */
function solidScriptSuggestionNameDetail(entry: SolidScriptName, scope: SolidScriptSuggestionScope): string {
  if (entry.reaches !== undefined) return entry.reaches;
  const kinds = solidScriptSuggestionKinds(entry.name, scope).filter((kind) => kind !== 'List');
  return solidScriptSentenceTyped(kinds.join(' or '), entry.detail);
}

/**
 * Lists everything a field may be filled with, by group.
 *
 * @param scope What the field may refer to.
 * @returns Suggestions in group order.
 */
/**
 * Describes a name the command fills in, such as $NZ, with its kind and
 * meaning.
 *
 * @param name Fill name as declared.
 * @returns Suggestion.
 */
function solidScriptSuggestionFill(name: string): SolidScriptSuggestion {
  const fill = solidScriptSystemFill(name);
  return {
    label: fill?.name ?? name,
    detail: fill ? solidScriptSentenceTyped(fill.type, fill.detail) : 'Filled in for this command.',
    category: 'This Command',
    pick: 'value',
    each: solidScriptSystemFillEach(name),
  };
}

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
    ...SOLID_SCRIPT_SYSTEM_LISTED.map(([label, type, detail]): SolidScriptSuggestion => ({
      label,
      detail: solidScriptSentenceTyped(type, detail),
      category: 'System',
      pick: 'value',
    })),
    ...scope.extra.map((name): SolidScriptSuggestion => solidScriptSuggestionFill(name)),
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
 * Tells the kinds the start of a typed name may hold where the line stands:
 * those the script's names with that name may hold, or a List for a name only
 * list lines write.
 *
 * @param key Name, lower case.
 * @param scope What the field may refer to.
 * @returns Kinds, empty when unknown.
 */
function solidScriptSuggestionHead(key: string, scope: SolidScriptSuggestionScope): string[] {
  const named = scope.names.filter((known) => known.name.toLowerCase() === key);
  const kinds = named.flatMap((known) => known.kinds ?? []);
  if (kinds.length > 0) return [...new Set(kinds)];
  return named.some((known) => known.category === 'Lists') ? ['List'] : [];
}

/**
 * Tells the kinds of value a typed name may hold: a system value, or a name of
 * the script with the kinds it may hold where the line stands, then each member
 * after it, such as Face List for $Selected.Faces and Vector for
 * $Selected.Faces.First.Normal.
 *
 * @param name Name as typed, without a trailing dot.
 * @param scope What the field may refer to.
 * @returns Kinds, empty when none is known.
 */
function solidScriptSuggestionKinds(name: string, scope: SolidScriptSuggestionScope): string[] {
  return solidScriptFlowPathKinds(name, (key) => solidScriptSuggestionHead(key, scope)).filter(
    (kind) => kind !== SOLID_SCRIPT_FLOW_UNKNOWN,
  );
}

/**
 * Lists the members of every kind a value may hold, each once, so no member
 * that may be right is hidden.
 *
 * @param base Typed value before the dot.
 * @param kinds Kinds it may hold.
 * @param keep Tells whether a member of a kind is listed.
 * @param pick How the suggestions are written.
 * @returns Members.
 */
function solidScriptSuggestionMembersOf(
  base: string,
  kinds: readonly string[],
  keep: (kind: string, name: string) => boolean,
  pick: SolidScriptSuggestionPick,
): SolidScriptSuggestion[] {
  const listed = new Map<string, SolidScriptSuggestion>();
  for (const kind of kinds)
    for (const name of solidScriptSuggestionMemberNames(kind))
      if (!listed.has(name) && keep(kind, name)) listed.set(name, solidScriptSuggestionMember(base, kind, name, pick));
  return [...listed.values()];
}

/**
 * Lists the members of a kind, those of List for a list of anything.
 *
 * @param kind Kind.
 * @returns Members as written.
 */
function solidScriptSuggestionMemberNames(kind: string): string[] {
  return kind === 'List' ? Object.keys(SOLID_SCRIPT_MEMBER_TYPES['List'] ?? {}) : solidScriptMemberNames(kind);
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
    const group = SOLID_SCRIPT_SYSTEM_LISTED.filter(([label]) =>
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
  const kinds = solidScriptSuggestionKinds(base, scope);
  if (kinds.length === 0) return null;
  return solidScriptSuggestionMembersOf(base, kinds, () => true, 'value');
}

/**
 * Describes one member of a typed value as a suggestion, such as Brush.Edges
 * with what it gives.
 *
 * @param base Typed value before the dot.
 * @param type Kind of that value.
 * @param name Member as written.
 * @param pick How the suggestion is written.
 * @returns Suggestion.
 */
function solidScriptSuggestionMember(
  base: string,
  type: string,
  name: string,
  pick: SolidScriptSuggestionPick,
): SolidScriptSuggestion {
  const gives = solidScriptSuggestionMemberGives(type, name);
  return {
    label: `${base}.${name}`,
    detail:
      gives === 'Item' || gives === null
        ? `The ${name.toLowerCase()} item of ${base}.`
        : solidScriptSentenceTyped(gives, `the .${name} of ${base}`),
    category: 'Members',
    pick,
  };
}

/**
 * Tells the kind a member of a kind of value gives; an item of a list of
 * unknown kind is Item.
 *
 * @param type Kind of the value.
 * @param name Member as written.
 * @returns Kind, or null when the value has no such member.
 */
function solidScriptSuggestionMemberGives(type: string, name: string): string | null {
  return type === 'List' ? (name === 'Count' ? 'Number' : 'Item') : solidScriptMemberType(type, name);
}

/**
 * Tells whether a kind holds brushes, faces, edges or corners, alone or as a
 * list, whose values under .Data a line can set.
 *
 * @param type Kind, such as Face or Edge List.
 * @returns True for such a kind.
 */
function solidScriptSuggestionPathElement(type: string | null): boolean {
  const item = type?.replace(/ List$/, '') ?? '';
  return solidScriptMemberType(item, 'Data') !== null;
}

/**
 * Lists, for a field holding a whole path a Set writes, the members after the
 * last dot that lead to a value a line can set: Data and the members that give
 * brushes, faces, edges or corners, or .X, .Y and .Z of a vector variable.
 * Members a line can only read, such as Center, are left out.
 *
 * @param prefix Typed path.
 * @param scope What the field may refer to.
 * @returns Members, or null when nothing before a dot is typed or it is a
 *   system value.
 */
function solidScriptSuggestionPaths(prefix: string, scope: SolidScriptSuggestionScope): SolidScriptSuggestion[] | null {
  const dot = prefix.lastIndexOf('.');
  if (dot < 0 || prefix.startsWith('$')) return null;
  const base = prefix.slice(0, dot);
  const kinds = solidScriptSuggestionKinds(base, scope).filter((kind) => kind !== 'List');
  return solidScriptSuggestionMembersOf(
    base,
    kinds,
    (kind, name) => solidScriptSuggestionWritable(base, kind, name),
    'word',
  );
}

/**
 * Tells whether a member leads to a value a line can set: Data, a member that
 * gives brushes, faces, edges or corners, or a part a Set may write, such as .X
 * of a vector.
 *
 * @param base Typed value before the dot.
 * @param kind Kind of that value.
 * @param name Member as written.
 * @returns True when a Set may write through it.
 */
function solidScriptSuggestionWritable(base: string, kind: string, name: string): boolean {
  const gives = solidScriptSuggestionMemberGives(kind, name);
  if (gives?.replace(/ List$/, '') === 'Data' || solidScriptSuggestionPathElement(gives)) return true;
  return solidScriptNameDotProblem(`${base}.${name}`, 'set') === '';
}

/**
 * Lists the system values a line may set, the [$Selected.*] lists, as words a
 * field holding a whole path offers.
 *
 * @returns Words with their kind and meaning.
 */
export function solidScriptSuggestionSelectedWords(): SolidScriptCommandWord[] {
  const selected = (SOLID_SCRIPT_SYSTEM_VALUES['Selected'] ?? []).map((member) => `$Selected.${member}`.toLowerCase());
  return SOLID_SCRIPT_SYSTEM_LISTED.filter(([label]) => selected.includes(label.toLowerCase())).map(
    ([word, type, detail]) => ({ word, detail: `${type}: ${detail}` }),
  );
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
  const paths =
    context.kind === 'word' && scope.paths === true ? solidScriptSuggestionPaths(context.prefix, scope) : null;
  if (paths) return paths.filter((entry) => entry.label.toLowerCase().startsWith(prefix));
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
      type: 'Any' as const,
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
    gives: solidScriptFunctionKindsText(doc.gives),
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
  return `${input.name}: ${solidScriptFunctionKindsText(input.type)}`;
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
