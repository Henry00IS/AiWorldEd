import type { SolidScriptCommandEach } from '@/solid_script/commands/solid_script_command_each.js';
import type { SolidScriptFieldKind } from './solid_script_field.js';
import { SOLID_SCRIPT_FACING_WITHIN_DEFAULT } from './solid_script_condition.js';
import { SOLID_SCRIPT_CONDITION_HELPERS, type SolidScriptConditionHelper } from './solid_script_condition_helpers.js';
import { solidScriptFunctionKey } from './solid_script_name_key.js';

/** How the rows of a group join: every row must hold, or any one. */
export type SolidScriptQueryJoin = 'all' | 'any';

/** Shared fields of one query row. */
interface SolidScriptQueryBase {
  /** True when this row is negated. */
  not: boolean;
  /** Text this row was read from, exactly as typed. */
  raw: string;
  /** True when easy mode changed this row, so it must be written again. */
  dirty: boolean;
}

/** One row of the query editor: a curated helper, a group, or Custom text. */
export type SolidScriptQueryNode =
  | (SolidScriptQueryBase & { kind: 'helper'; key: string; inputs: string[] })
  | (SolidScriptQueryBase & { kind: 'custom'; text: string })
  | (SolidScriptQueryBase & { kind: 'group'; join: SolidScriptQueryJoin; items: SolidScriptQueryNode[] });

/** Openers and the closers they need. */
const SOLID_SCRIPT_QUERY_PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };

/** Pattern of a plain number as typed. */
const SOLID_SCRIPT_QUERY_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** Named directions used in Facing summaries, in the editor's axes. */
const SOLID_SCRIPT_QUERY_DIRECTIONS: readonly { name: string; parts: readonly string[] }[] = [
  { name: 'Up', parts: ['0', '1', '0'] },
  { name: 'Down', parts: ['0', '-1', '0'] },
  { name: 'Left', parts: ['-1', '0', '0'] },
  { name: 'Right', parts: ['1', '0', '0'] },
  { name: 'Front', parts: ['0', '0', '1'] },
  { name: 'Back', parts: ['0', '0', '-1'] },
];

/**
 * Hidden first inputs of curated helpers, by the element a 🔁 field walks and
 * the helper key. Easy mode leaves these out of the row.
 */
const SOLID_SCRIPT_QUERY_HIDDEN: Readonly<
  Partial<Record<SolidScriptCommandEach, Readonly<Record<string, Readonly<Record<string, string>>>>>>
> = {
  Face: {
    facing: { normal: '[$Face.Normal]' },
    in_box: { point: '[$Face.Center]' },
    near: { point: '[$Face.Center]' },
    has_tag: { tags: '[$Face.Tags]' },
    every_nth: { index: '[$Index]' },
    hits: { element: '[$Face]' },
  },
  Edge: {
    facing: { normal: '[$Edge.Direction]' },
    in_box: { point: '[$Edge.Middle]' },
    near: { point: '[$Edge.Middle]' },
    every_nth: { index: '[$Index]' },
    hits: { element: '[$Edge]' },
  },
  Vertex: {
    facing: { normal: '[$Vertex.Normal]' },
    in_box: { point: '[$Vertex.Position]' },
    near: { point: '[$Vertex.Position]' },
    every_nth: { index: '[$Index]' },
    hits: { element: '[$Vertex]' },
  },
  Brush: {
    in_box: { point: '[$Brush.Center]' },
    near: { point: '[$Brush.Center]' },
    every_nth: { index: '[$Index]' },
    hits: { element: '[$Brush]' },
  },
  Point: {
    facing: { normal: '[$Point.Normal]' },
    in_box: { point: '[$Point.Position]' },
    near: { point: '[$Point.Position]' },
    every_nth: { index: '[$Index]' },
    hits: { element: '[$Point]' },
  },
  Item: { every_nth: { index: '[$Index]' }, hits: { element: '[$Item]' } },
};

/**
 * Lists where each top-level part of a formula starts and ends, split by a
 * separator, outside brackets and quoted text.
 *
 * @param text Formula.
 * @param width Tells the length of a separator at an index, or 0.
 * @returns Parts, untrimmed.
 */
export function solidScriptQuerySplit(text: string, width: (index: number) => number): string[] {
  const parts: string[] = [];
  const closers: string[] = [];
  let quoted = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) quoted = !(char === '"' && text.charAt(index - 1) !== '\\');
    else if (char === '"') quoted = true;
    else if (SOLID_SCRIPT_QUERY_PAIRS[char]) closers.push(SOLID_SCRIPT_QUERY_PAIRS[char] ?? '');
    else if (char === closers[closers.length - 1]) closers.pop();
    else if (closers.length === 0 && width(index) > 0) {
      parts.push(text.slice(start, index));
      start = index + width(index);
      index = start - 1;
    }
  }
  return [...parts, text.slice(start)];
}

/**
 * Tells the length of an And or Or operator at an index: the symbol, or the
 * word with spaces around it.
 *
 * @param text Formula.
 * @param join All for && and And, any for || and Or.
 * @param index Character index.
 * @returns Separator length, or 0.
 */
export function solidScriptQueryJoinWidth(text: string, join: SolidScriptQueryJoin, index: number): number {
  const symbol = join === 'all' ? '&&' : '||';
  if (text.startsWith(symbol, index)) return symbol.length;
  const found = new RegExp(`^\\s${join === 'all' ? 'and' : 'or'}\\s`, 'i').exec(text.slice(index));
  return found ? found[0].length : 0;
}

/**
 * Splits a formula on commas outside brackets, such as the inputs of a call.
 *
 * @param text Formula.
 * @returns Parts, trimmed.
 */
export function solidScriptQueryArguments(text: string): string[] {
  if (text.trim() === '') return [];
  return solidScriptQuerySplit(text, (index) => (text.charAt(index) === ',' ? 1 : 0)).map((part) => part.trim());
}

/**
 * Tells whether text is wrapped whole in one pair of brackets, such as (a && b)
 * or [Width], and not two pairs side by side such as (a) && (b).
 *
 * @param text Text, already trimmed.
 * @param open Opening bracket.
 * @returns True when the first bracket closes at the very end.
 */
export function solidScriptQueryWrapped(text: string, open: string): boolean {
  const close = SOLID_SCRIPT_QUERY_PAIRS[open];
  if (!close || !text.startsWith(open) || !text.endsWith(close) || text.length < 2) return false;
  const closers: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) quoted = !(char === '"' && text.charAt(index - 1) !== '\\');
    else if (char === '"') quoted = true;
    else if (SOLID_SCRIPT_QUERY_PAIRS[char]) closers.push(SOLID_SCRIPT_QUERY_PAIRS[char] ?? '');
    else if (char === closers[closers.length - 1]) {
      closers.pop();
      if (closers.length === 0) return index === text.length - 1;
    }
  }
  return false;
}

/**
 * Finds the curated helper a call names, ignoring case and underscores.
 *
 * @param name Call name as written.
 * @returns Helper, or undefined.
 */
export function solidScriptQueryHelper(name: string): SolidScriptConditionHelper | undefined {
  const key =
    solidScriptFunctionKey(name) === solidScriptFunctionKey('hits_box') ? 'hits' : solidScriptFunctionKey(name);
  return SOLID_SCRIPT_CONDITION_HELPERS.find((helper) => solidScriptFunctionKey(helper.key) === key);
}

/**
 * Reads one term that is a call of a curated helper with a fitting number of
 * inputs, such as InBox([$Face.Center], Vector(0, 0, 0), 2).
 *
 * @param text Term, trimmed, without Not.
 * @returns Helper key and inputs as field text, or undefined.
 */

/**
 * Tells whether a formula argument is a Hits How word, quoted or not.
 *
 * @param text Argument as written.
 * @returns True for Touching, Overlapping or Fully Inside.
 */
function solidScriptQueryHow(text: string): boolean {
  const folded = text
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/\s+/g, '')
    .toLowerCase();
  return folded === 'touching' || folded === 'overlapping' || folded === 'fullyinside';
}

/**
 * Maps the arguments of Hits or HitsBox onto the Hits easy-mode inputs:
 * element, Box, Center, Size and How.
 *
 * @param name Call name as written.
 * @param args Arguments as written.
 * @returns Inputs, or undefined when the call shape does not fit.
 */
function solidScriptQueryHitsInputs(name: string, args: readonly string[]): string[] | undefined {
  const tail = args[args.length - 1] ?? '';
  const how = args.length > 0 && solidScriptQueryHow(tail) ? tail : '';
  const body = how ? args.slice(0, -1) : args;
  const box = solidScriptFunctionKey(name) === solidScriptFunctionKey('hits_box');
  if (box && body.length === 3) return [body[0] ?? '', '', body[1] ?? '', body[2] ?? '', how];
  if (!box && body.length === 2) return [body[0] ?? '', body[1] ?? '', '', '', how];
  return undefined;
}

/**
 * Writes a Hits or HitsBox call from easy-mode inputs. A Box uses Hits; Center
 * and Size use HitsBox. How is left off when it is empty or Touching.
 *
 * @param inputs Element, Box, Center, Size and How as field text.
 * @returns Call text.
 */
function solidScriptQueryHitsText(inputs: readonly string[]): string {
  const element = solidScriptQueryFormulaFromField(inputs[0] ?? '');
  const target = solidScriptQueryFormulaFromField(inputs[1] ?? '');
  const center = solidScriptQueryFormulaFromField(inputs[2] ?? '');
  const size = solidScriptQueryFormulaFromField(inputs[3] ?? '');
  const how = (inputs[4] ?? '').trim();
  const skip = how === '' || (solidScriptQueryHow(how) && how.replace(/['"]/g, '').trim().toLowerCase() === 'touching');
  const last = skip ? '' : `, ${solidScriptQueryFormulaFromField(how)}`;
  return target !== '' ? `Hits(${element}, ${target}${last})` : `HitsBox(${element}, ${center}, ${size}${last})`;
}

/**
 * Turns one helper argument into easy-mode field text. A Hits How word stays a
 * word, such as Overlapping, not a formula name.
 *
 * @param key Helper key.
 * @param index Input index.
 * @param input Argument as written.
 * @returns Field text.
 */
function solidScriptQueryInputField(key: string, index: number, input: string): string {
  if (key === 'hits' && index === 4 && solidScriptQueryHow(input)) return input.trim().replace(/^"(.*)"$/, '$1');
  return solidScriptQueryFieldFromFormula(input);
}

function solidScriptQueryCall(text: string): { key: string; inputs: string[] } | undefined {
  const found = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(text);
  if (!found?.[1]) return undefined;
  const helper = solidScriptQueryHelper(found[1]);
  const call = text.slice(found[0].length - 1);
  if (!helper || !solidScriptQueryWrapped(call, '(')) return undefined;
  const raw = solidScriptQueryArguments(call.slice(1, -1));
  const mapped = helper.key === 'hits' ? solidScriptQueryHitsInputs(found[1], raw) : raw;
  if (!mapped) return undefined;
  const needed = helper.inputs.filter((input) => input.optional === undefined).length;
  if (mapped.length < needed || mapped.length > helper.inputs.length) return undefined;
  return {
    key: helper.key,
    inputs: mapped.map((input, index) => solidScriptQueryInputField(helper.key, index, input)),
  };
}

/**
 * Tells whether a term is one call or one bracket group with nothing after it,
 * which a Not applies to whole.
 *
 * @param text Term, trimmed.
 * @returns True for one call or group.
 */
function solidScriptQueryLone(text: string): boolean {
  if (solidScriptQueryWrapped(text, '(')) return true;
  const found = /^[A-Za-z_][A-Za-z0-9_]*\s*/.exec(text);
  return found !== null && solidScriptQueryWrapped(text.slice(found[0].length), '(');
}

/**
 * Splits a leading Not off a term: ! or the word not, when it applies to one
 * call or one group.
 *
 * @param text Term, trimmed.
 * @returns Whether it is negated, and the rest.
 */
function solidScriptQueryNot(text: string): { not: boolean; rest: string } {
  const found = /^(!(?!=)|not\s+)/i.exec(text);
  if (!found) return { not: false, rest: text };
  const rest = text.slice(found[0].length).trim();
  return solidScriptQueryLone(rest) ? { not: true, rest } : { not: false, rest: text };
}

/**
 * Reads one term: a Not, a group in brackets, a curated helper, or Custom.
 *
 * @param raw Term as typed.
 * @returns Row.
 */
function solidScriptQueryTerm(raw: string): SolidScriptQueryNode {
  const { not, rest } = solidScriptQueryNot(raw.trim());
  if (solidScriptQueryWrapped(rest, '(')) {
    const inner = solidScriptQueryGroup(rest.slice(1, -1));
    if (inner.kind === 'group') return { ...inner, not, raw: raw.trim() };
  }
  const call = solidScriptQueryCall(rest);
  if (call) return { kind: 'helper', not, raw: raw.trim(), dirty: false, ...call };
  return { kind: 'custom', not: false, raw: raw.trim(), dirty: false, text: raw.trim() };
}

/**
 * Reads one part of a split: an And part of an Or keeps its own And group.
 *
 * @param join How the parts were split.
 * @param part One part.
 * @returns Row.
 */
function solidScriptQueryPart(join: SolidScriptQueryJoin, part: string): SolidScriptQueryNode {
  if (join === 'all') return solidScriptQueryTerm(part);
  const group = solidScriptQueryGroup(part);
  const only = group.kind === 'group' && group.items.length === 1 ? group.items[0] : undefined;
  return only ?? group;
}

/**
 * Reads a formula into a group of rows: split on Or first, then And, as the
 * formula binds them.
 *
 * @param text Formula.
 * @returns Group.
 */
/**
 * Builds a group that has not been edited, keeping the formula as typed.
 *
 * @param text Formula.
 * @param join How the rows join.
 * @param items Rows.
 * @returns Group.
 */
function solidScriptQueryFreshGroup(
  text: string,
  join: SolidScriptQueryJoin,
  items: readonly SolidScriptQueryNode[],
): SolidScriptQueryNode {
  return { kind: 'group', not: false, raw: text.trim(), dirty: false, join, items: [...items] };
}

/**
 * Reads a formula into a group of rows: split on Or first, then And, as the
 * formula binds them.
 *
 * @param text Formula.
 * @returns Group.
 */
function solidScriptQueryGroup(text: string): SolidScriptQueryNode {
  for (const join of ['any', 'all'] as const) {
    const parts = solidScriptQuerySplit(text, (index) => solidScriptQueryJoinWidth(text, join, index));
    if (parts.length > 1 && parts.every((part) => part.trim() !== ''))
      return solidScriptQueryFreshGroup(
        text,
        join,
        parts.map((part) => solidScriptQueryPart(join, part)),
      );
  }
  return solidScriptQueryFreshGroup(text, 'all', text.trim() === '' ? [] : [solidScriptQueryTerm(text)]);
}

/**
 * Reads a condition formula into the rows of easy mode. Code stays the source
 * of truth: every row keeps its text as typed, and a part easy mode does not
 * know becomes a Custom row with that exact text.
 *
 * @param text Formula, without the [= ] of a field.
 * @returns Root group.
 */
export function solidScriptQueryRead(text: string): SolidScriptQueryNode {
  return solidScriptQueryGroup(text);
}

/**
 * Tells whether a row or any row inside it was changed in easy mode.
 *
 * @param node Row or group.
 * @returns True when it must be written again.
 */
export function solidScriptQueryChanged(node: SolidScriptQueryNode): boolean {
  return node.dirty || (node.kind === 'group' && node.items.some(solidScriptQueryChanged));
}

/**
 * Writes a call of a curated helper, leaving off trailing optional inputs that
 * are empty.
 *
 * @param key Helper key, such as in_box.
 * @param inputs Inputs as field text.
 * @returns Call text, such as InBox([$Face.Center], Vector(0, 0, 0), 2).
 */
export function solidScriptQueryHelperText(key: string, inputs: readonly string[]): string {
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === key);
  if (key === 'hits') return solidScriptQueryHitsText(inputs);
  const written = inputs.map((input) => solidScriptQueryFormulaFromField(input));
  while (written.length > 0 && written[written.length - 1] === '') written.pop();
  return `${helper?.name ?? key}(${written.join(', ')})`;
}

/**
 * Writes rows back as a formula. Rows nobody changed keep their text exactly as
 * typed; changed rows are written in the usual form.
 *
 * @param node Row or group.
 * @param root True for the outermost group, which needs no brackets.
 * @returns Formula.
 */
export function solidScriptQueryText(node: SolidScriptQueryNode, root = true): string {
  if (!solidScriptQueryChanged(node)) return node.raw;
  if (node.kind === 'custom') return node.not ? `!(${node.text})` : node.text;
  if (node.kind === 'helper') {
    const call = solidScriptQueryHelperText(node.key, node.inputs);
    return node.not ? `!${call}` : call;
  }
  const body = node.items.map((item) => solidScriptQueryText(item, false)).join(node.join === 'all' ? ' && ' : ' || ');
  return root && !node.not ? body : `${node.not ? '!' : ''}(${body})`;
}

/**
 * Turns formula text of one helper input into what its easy-mode field shows: a
 * number or [Name] as is, a vector of plain parts as 0, 1, 0, a quoted word as
 * the word, and anything else as [=formula].
 *
 * @param formula Input as written in the call.
 * @returns Field text.
 */
export function solidScriptQueryFieldFromFormula(formula: string): string {
  const text = formula.trim();
  if (text === '' || SOLID_SCRIPT_QUERY_NUMBER.test(text) || solidScriptQueryWrapped(text, '[')) return text;
  const quoted = /^"([^"\\]*)"$/.exec(text);
  if (quoted?.[1] !== undefined && quoted[1].trim() === quoted[1] && /^[^,[\]]+$/.test(quoted[1])) return quoted[1];
  const vector = /^Vector\s*\((.*)\)$/i.exec(text);
  const parts = vector?.[1] !== undefined ? solidScriptQueryArguments(vector[1]) : [];
  if (parts.length === 3 && parts.every(solidScriptQueryPlainPart)) return parts.join(', ');
  return `[=${text}]`;
}

/**
 * Tells whether one part of a vector is a number or a [Name], not a formula.
 *
 * @param part Part, trimmed.
 * @returns True for a plain part.
 */
function solidScriptQueryPlainPart(part: string): boolean {
  return SOLID_SCRIPT_QUERY_NUMBER.test(part) || (solidScriptQueryWrapped(part, '[') && !part.startsWith('[='));
}

/**
 * Turns the text of one easy-mode field into formula text: a number or [Name]
 * as is, [=formula] as the formula, three plain parts as Vector(), and a word
 * as quoted text.
 *
 * @param field Field text.
 * @returns Formula text.
 */
export function solidScriptQueryFormulaFromField(field: string): string {
  const text = field.trim();
  if (text === '' || SOLID_SCRIPT_QUERY_NUMBER.test(text)) return text;
  if (text.startsWith('[=') && solidScriptQueryWrapped(text, '[')) return text.slice(2, -1).trim();
  if (solidScriptQueryWrapped(text, '[')) return text;
  const parts = solidScriptQueryArguments(text);
  if (parts.length === 3 && parts.every(solidScriptQueryPlainPart)) return `Vector(${parts.join(', ')})`;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Takes the formula body out of stored field text: a value field may wrap it in
 * [= ], a condition field is the formula itself.
 *
 * @param kind Field kind.
 * @param stored Stored field text.
 * @returns Formula body.
 */
export function solidScriptQueryBody(kind: SolidScriptFieldKind, stored: string): string {
  const text = stored.trim();
  if (kind !== 'condition' && text.startsWith('[=') && solidScriptQueryWrapped(text, '['))
    return text.slice(2, -1).trim();
  return text;
}

/**
 * Stores a formula body as field text: a value field wraps it in [= ], a
 * condition field keeps it as is. An empty body stays empty.
 *
 * @param kind Field kind.
 * @param body Formula body.
 * @returns Stored field text.
 */
export function solidScriptQueryStore(kind: SolidScriptFieldKind, body: string): string {
  const text = body.trim();
  if (text === '') return '';
  return kind === 'condition' ? text : `[=${text}]`;
}

/**
 * Reads stored field text into rows, keeping the original text so an unchanged
 * formula is written back exactly.
 *
 * @param kind Field kind.
 * @param stored Stored field text.
 * @returns Rows.
 */
export function solidScriptQueryFromField(kind: SolidScriptFieldKind, stored: string): SolidScriptQueryNode {
  const node = solidScriptQueryRead(solidScriptQueryBody(kind, stored));
  return { ...node, raw: stored };
}

/**
 * Writes rows back as stored field text. When nothing changed, the original
 * stored text is kept exactly, including its [= ] wrapping.
 *
 * @param kind Field kind.
 * @param node Rows, possibly from solidScriptQueryFromField.
 * @returns Stored field text.
 */
export function solidScriptQueryToField(kind: SolidScriptFieldKind, node: SolidScriptQueryNode): string {
  if (!solidScriptQueryChanged(node)) return node.raw;
  return solidScriptQueryStore(kind, solidScriptQueryText({ ...node, dirty: true }));
}

/**
 * Returns the hidden default of one helper input for a 🔁 element, or an empty
 * string when the input is shown.
 *
 * @param each Element the field walks, or undefined when there is none.
 * @param key Helper key.
 * @param input Input name, such as normal.
 * @returns Default field text, or an empty string.
 */
export function solidScriptQueryHidden(each: SolidScriptCommandEach | undefined, key: string, input: string): string {
  if (each === undefined) return '';
  return SOLID_SCRIPT_QUERY_HIDDEN[each]?.[key]?.[input] ?? '';
}

/**
 * Tells whether two field texts are the same, ignoring case and spaces.
 *
 * @param left One text.
 * @param right Other text.
 * @returns True when they match.
 */
export function solidScriptQuerySame(left: string, right: string): boolean {
  return left.replace(/\s+/g, '').toLowerCase() === right.replace(/\s+/g, '').toLowerCase();
}

/**
 * Tells whether an input should be hidden in easy mode: it equals the default
 * for this element, so the user does not need to see [$Face] and the like.
 *
 * @param each Element the field walks, or undefined when there is none.
 * @param key Helper key.
 * @param input Input name.
 * @param value Current field text.
 * @returns True when the input is hidden.
 */
export function solidScriptQueryInputHidden(
  each: SolidScriptCommandEach | undefined,
  key: string,
  input: string,
  value: string,
): boolean {
  const hidden = solidScriptQueryHidden(each, key, input);
  return hidden !== '' && solidScriptQuerySame(value, hidden);
}

/**
 * Builds a new helper row with hidden inputs already filled for the element.
 *
 * @param key Helper key.
 * @param each Element the field walks, or undefined when there is none.
 * @returns Dirty helper row.
 */
export function solidScriptQueryHelperCreate(
  key: string,
  each: SolidScriptCommandEach | undefined,
): SolidScriptQueryNode {
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === key);
  const inputs = (helper?.inputs ?? []).map((input) => solidScriptQueryHidden(each, key, input.name));
  return { kind: 'helper', not: false, raw: '', dirty: true, key, inputs };
}

/**
 * Builds a new Custom row.
 *
 * @param text Formula text.
 * @returns Dirty Custom row.
 */
export function solidScriptQueryCustomCreate(text = ''): SolidScriptQueryNode {
  return { kind: 'custom', not: false, raw: '', dirty: true, text };
}

/**
 * Builds a new group of rows.
 *
 * @param join How the rows join.
 * @param items Rows, or none.
 * @returns Dirty group.
 */
export function solidScriptQueryGroupCreate(
  join: SolidScriptQueryJoin,
  items: readonly SolidScriptQueryNode[] = [],
): SolidScriptQueryNode {
  return { kind: 'group', not: false, raw: '', dirty: true, join, items: [...items] };
}

/**
 * Named direction a vector field matches, such as Up for 0, 1, 0.
 *
 * @param value Field text.
 * @returns Name, or an empty string.
 */
function solidScriptQueryDirectionName(value: string): string {
  const parts = solidScriptQueryArguments(
    value.startsWith('[=') && solidScriptQueryWrapped(value, '[') ? value.slice(2, -1).trim() : value,
  );
  const formula = /^Vector\s*\((.*)\)$/i.exec(value);
  const items = formula?.[1] !== undefined ? solidScriptQueryArguments(formula[1]) : parts;
  const found = SOLID_SCRIPT_QUERY_DIRECTIONS.find(
    (entry) => items.length === 3 && entry.parts.every((part, index) => solidScriptQuerySame(part, items[index] ?? '')),
  );
  return found?.name ?? '';
}

/**
 * Short title of a Facing row, such as Face Points Up, Within 30°.
 *
 * @param node Helper row.
 * @param each Element the field walks, or undefined when there is none.
 * @param helper Helper declaration.
 * @returns Title, or an empty string when the usual display name should be
 *   used.
 */
function solidScriptQueryFacingTitle(
  node: Extract<SolidScriptQueryNode, { kind: 'helper' }>,
  each: SolidScriptCommandEach | undefined,
  helper: SolidScriptConditionHelper,
): string {
  const normal = helper.inputs[0]
    ? solidScriptQueryInputHidden(each, node.key, helper.inputs[0].name, node.inputs[0] ?? '')
    : false;
  const direction = solidScriptQueryDirectionName(node.inputs[1] ?? '');
  if (!normal || direction === '' || each === undefined) return '';
  const within = (node.inputs[2] ?? '').trim() || String(SOLID_SCRIPT_FACING_WITHIN_DEFAULT);
  return `${each} Points ${direction}, Within ${within}°`;
}

/**
 * Friendly title of a row in easy mode, such as In Box or Face Points Up,
 * Within 30°.
 *
 * @param node Row.
 * @param each Element the field walks, or undefined when there is none.
 * @returns Title in Title Case.
 */
export function solidScriptQueryTitle(node: SolidScriptQueryNode, each?: SolidScriptCommandEach): string {
  const prefix = node.not ? 'Not ' : '';
  if (node.kind === 'custom') return `${prefix}Custom`;
  if (node.kind === 'group') return `${prefix}${node.join === 'all' ? 'All Of' : 'Any Of'}`;
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === node.key);
  const facing = helper && node.key === 'facing' ? solidScriptQueryFacingTitle(node, each, helper) : '';
  return `${prefix}${facing || helper?.display || node.key}`;
}
