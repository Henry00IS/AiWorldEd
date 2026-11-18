import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';
import { solidScriptDocumentFlowAt, solidScriptDocumentFlowEnd } from './solid_script_document_flow.js';
import {
  solidScriptFlowKinds,
  solidScriptFlowSources,
  type SolidScriptFlowSource,
  type SolidScriptFlowState,
} from './solid_script_document_flow_state.js';
import { solidScriptSentenceTyped } from '@/solid_script/language/solid_script_sentence.js';
import {
  solidScriptGivenDetail,
  solidScriptGivenFields,
  solidScriptGivenFlow,
  solidScriptGivenFlowLabel,
  solidScriptGivenFlowName,
  type SolidScriptGiven,
} from './solid_script_document_gives.js';
import type { SolidScriptCommandGives } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_SHAPE_NAME_KEY } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptDocumentActiveLines } from './solid_script_document_active.js';
import { solidScriptBlockNesting } from './solid_script_document_indent.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptBuiltinFind } from '@/solid_script/language/solid_script_expression_compile.js';
import { solidScriptFieldTokenKey, solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';
import { solidScriptFieldAsTyped } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFunctionKey, solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';

/** Kinds of name a script defines, in the order the editor lists them. */
export const SOLID_SCRIPT_NAME_CATEGORIES = [
  'Inputs',
  'Variables',
  'Lists',
  'Counters',
  'Functions',
  'Locals',
  'Parts',
  'Brushes',
  'Handlers',
  'Persistent',
  'System',
] as const;

/** Kind of name a script defines. */
export type SolidScriptNameCategory = (typeof SOLID_SCRIPT_NAME_CATEGORIES)[number];

/** A name a script defines, found without running it. */
export interface SolidScriptName {
  /** Name as fields write it, without brackets. */
  name: string;
  /** What kind of name it is. */
  category: SolidScriptNameCategory;
  /** 0-based line that defines it first. */
  line: number;
  /** Short description, such as "count input" or "area(w, d)". */
  detail: string;
  /**
   * Kinds it may hold where the line stands, found by following the script
   * without running it, such as Brush or Face List; missing when only running
   * tells.
   */
  kinds?: readonly string[];
  /**
   * The writes that may reach where the line stands, each as a sentence after
   * the kinds it gives, such as "Brush: What is made of **Cube** (line 3).";
   * missing when no write is known there.
   */
  reaches?: string;
  /** 0-based lines of the writes that may reach where the line stands, in order. */
  reachLines?: readonly number[];
}

/** Pattern of a plain name, or of a Function's own variable. */
const SOLID_SCRIPT_NAME_PLAIN = /^(Local\.|Persistent\.)?[A-Za-z_][A-Za-z0-9_]*$/;

/** Name categories whose names hold a value whose kind the checks follow. */
const SOLID_SCRIPT_NAMES_KINDED: ReadonlySet<SolidScriptNameCategory> = new Set([
  'Inputs',
  'Variables',
  'Lists',
  'Counters',
  'Locals',
  'Persistent',
]);

/** Categories whose names only some lines see: Function locals and loop values. */
const SOLID_SCRIPT_NAMES_SCOPED: readonly SolidScriptNameCategory[] = ['Locals', 'Counters', 'System'];

/** Names collected in line order, each once per kind or once at all. */
class SolidScriptNameList {
  /** Names so far. */
  readonly names: SolidScriptName[] = [];

  /**
   * Starts an empty list.
   *
   * @param once True to keep a name once whatever its kind, false for once per
   *   kind.
   */
  constructor(private readonly once: boolean) {}

  /**
   * Adds a name unless it is no plain name or already listed.
   *
   * @param name Name as written.
   * @param category Kind of name.
   * @param line 0-based line that defines it.
   * @param detail Short description.
   */
  add(name: string, category: SolidScriptNameCategory, line: number, detail: string): void {
    const plain = solidScriptNameShown(name.trim());
    if (category !== 'System' && !SOLID_SCRIPT_NAME_PLAIN.test(plain)) return;
    const same = (entry: SolidScriptName): boolean =>
      entry.name === plain && (this.once || entry.category === category);
    if (!this.names.some(same)) this.names.push({ name: plain, category, line, detail });
  }
}

/**
 * Names a block for a description, in bold, such as **Cube**.
 *
 * @param command Command id.
 * @returns Its label in bold.
 */
function solidScriptNameBlock(command: string): string {
  return `**${solidScriptCommandFind(command)?.label ?? command}**`;
}

/**
 * Lists the counters a loop line gives the lines inside it, such as the counter
 * of a Repeat or the item and key of a For Each: the variables its fields
 * write.
 *
 * @param block Loop line.
 * @returns Counters with their descriptions.
 */
function solidScriptNameCounters(block: SolidScriptBlock): { name: string; detail: string }[] {
  if (solidScriptGivenFlow(block)?.kind !== 'loop') return [];
  return solidScriptGivenFields(block).flatMap(({ gives, name }) =>
    'what' in gives ? [{ name, detail: solidScriptGivenDetail(block, gives.what) }] : [],
  );
}

/**
 * Tells what kind of name a field gives when its name is plain: an Input for a
 * word such as an Input Type, a list for a list line, else a variable.
 *
 * @param gives What the field gives.
 * @returns Category.
 */
function solidScriptNameCategoryOf(gives: SolidScriptCommandGives): SolidScriptNameCategory {
  if (gives.rule === 'word') return 'Inputs';
  return gives.rule === 'list' ? 'Lists' : 'Variables';
}

/**
 * Names the kinds a name may hold for people, such as Text or Brush.
 *
 * @param kinds Kinds, the unknown kind among them left out.
 * @returns Kinds joined by or; empty when none is known.
 */
export function solidScriptNameKindsText(kinds: readonly string[] | undefined): string {
  return (kinds ?? []).filter((kind) => kind !== '').join(' or ');
}

/**
 * Spells the Local. and Persistent. starts the way they are taught, whatever
 * case a line wrote them in, such as Local.Angle for local.Angle.
 *
 * @param name Name as written.
 * @returns Name with its start in PascalCase.
 */
export function solidScriptNameShown(name: string): string {
  return name.replace(/^local\./i, 'Local.').replace(/^persistent\./i, 'Persistent.');
}

/**
 * Gives each name that holds a value the kinds it may hold at a point of the
 * script; a name not set there gets none.
 *
 * @param names Names.
 * @param state Variables at that point.
 * @returns Names with their kinds.
 */
function solidScriptNamesKinds(
  names: readonly SolidScriptName[],
  state: SolidScriptFlowState,
  blocks: readonly SolidScriptBlock[],
): SolidScriptName[] {
  return names.map((entry) => {
    const { name, category, line, detail } = entry;
    if (!SOLID_SCRIPT_NAMES_KINDED.has(category)) return { name, category, line, detail };
    const key = solidScriptNameKey(name);
    const kinds = solidScriptFlowKinds(state, key);
    const sources = solidScriptFlowSources(state, key).filter((source) => source.kinds.length > 0);
    const reaches = solidScriptNameReaches(sources, key, blocks);
    return {
      name,
      category,
      line,
      detail,
      ...(kinds && kinds.length > 0 ? { kinds } : {}),
      ...(reaches !== '' ? { reaches, reachLines: sources.map((source) => source.line) } : {}),
    };
  });
}

/**
 * Describes the writes that may reach a point, each by its own line: what the
 * field that writes the name gives, or the line that passes it in, such as the
 * Call of a Function, with the kinds it gives there.
 *
 * @param sources Writes, in line order.
 * @param key Name key.
 * @param blocks Lines of the script.
 * @returns Sentences; empty when no write gives a known kind.
 */
function solidScriptNameReaches(
  sources: readonly SolidScriptFlowSource[],
  key: string,
  blocks: readonly SolidScriptBlock[],
): string {
  return sources
    .filter((source) => source.kinds.length > 0 && blocks[source.line] !== undefined)
    .map((source) => {
      const what = solidScriptNameWriteText(blocks[source.line] as SolidScriptBlock, key);
      return solidScriptSentenceTyped(source.kinds.join(' or '), `${what} (line ${source.line + 1})`);
    })
    .join(' ');
}

/**
 * Tells what one line does to a name: what its field naming it gives, or that
 * it passes the name in, as a Call passes a Function's inputs.
 *
 * @param block Line.
 * @param key Name key.
 * @returns Description, with the command in bold.
 */
function solidScriptNameWriteText(block: SolidScriptBlock, key: string): string {
  const given = solidScriptGivenFields(block).find((entry) => solidScriptNameKey(entry.name) === key);
  const label = solidScriptCommandFind(block.command)?.label ?? block.command;
  if (!given) return `passed in by **${label}**`;
  return 'what' in given.gives ? solidScriptGivenDetail(block, given.gives.what) : `from **${label}**`;
}

/**
 * Lists the names a script defines, in line order, each once per kind: Input,
 * Set, Call results, Repeat and For Each counters, Function inputs as
 * Local.Name, Define Part, shape Names, When Input Changes and When Button
 * Pressed lines, each with the kinds it may hold when the script's own lines
 * are done. Names built from other names, such as part[i], are left out. Lines
 * turned off give none.
 *
 * @param document Script.
 * @returns Names.
 */
export function solidScriptDocumentNames(document: SolidScriptDocument): SolidScriptName[] {
  const list = new SolidScriptNameList(false);
  for (const { block, line } of solidScriptDocumentActiveLines(document.blocks)) {
    solidScriptNamesOfValues(list, block, line);
    solidScriptNamesOfBlocks(list, block, line);
  }
  return solidScriptNamesKinds(list.names, solidScriptDocumentFlowEnd(document), document.blocks);
}

/**
 * Adds the names a line's fields give a value, as its command declares them: a
 * list by its plain name for an item such as Points(2), a Function local, a
 * Persistent value, or a name of the field's category. Loop counters are added
 * where the loop is open.
 *
 * @param list Names so far.
 * @param block Line.
 * @param line 0-based line.
 */
function solidScriptNamesOfValues(list: SolidScriptNameList, block: SolidScriptBlock, line: number): void {
  if (solidScriptGivenFlow(block)?.kind === 'loop') return;
  for (const given of solidScriptGivenFields(block)) solidScriptNamesOfGiven(list, block, line, given);
}

/**
 * Adds the name one field gives a value.
 *
 * @param list Names so far.
 * @param block Line.
 * @param line 0-based line.
 * @param given Field and the name typed in it.
 */
function solidScriptNamesOfGiven(
  list: SolidScriptNameList,
  block: SolidScriptBlock,
  line: number,
  given: SolidScriptGiven,
): void {
  const { gives, name } = given;
  if (!('what' in gives)) return;
  const detail = solidScriptGivenDetail(block, gives.what);
  const item = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(.*\)$/.exec(name);
  if (item) list.add(item[1] ?? '', 'Lists', line, 'list');
  else if (/^local\./i.test(name))
    list.add(name, 'Locals', line, `${detail} in a **${solidScriptGivenFlowLabel('function')}**`);
  else if (/^persistent\./i.test(name)) list.add(name, 'Persistent', line, 'kept between runs');
  else list.add(name, solidScriptNameCategoryOf(gives), line, detail);
}

/**
 * Adds the names a block line defines: loop counters, a Function and its
 * inputs, a part, a shape Name and the name a When line watches.
 *
 * @param list Names so far.
 * @param block Line.
 * @param line 0-based line.
 */
function solidScriptNamesOfBlocks(list: SolidScriptNameList, block: SolidScriptBlock, line: number): void {
  const kind = solidScriptGivenFlow(block)?.kind;
  const name = solidScriptGivenFlowName(block);
  for (const counter of solidScriptNameCounters(block)) list.add(counter.name, 'Counters', line, counter.detail);
  if (kind === 'function') solidScriptNamesOfFunction(list, block, line);
  if (kind === 'part') list.add(name, 'Parts', line, solidScriptNameBlock(block.command));
  const label = block.values[SOLID_SCRIPT_SHAPE_NAME_KEY] ?? '';
  if (label.trim() !== '') list.add(label, 'Brushes', line, `Name of a ${solidScriptNameBlock(block.command)} line`);
  if (kind === 'handler' && name !== '') list.add(name, 'Handlers', line, solidScriptNameBlock(block.command));
}

/**
 * Reads the inputs a Function line names, from the field its flow declares.
 *
 * @param block Function line.
 * @returns Input names, trimmed, without empty ones.
 */
function solidScriptNameInputs(block: SolidScriptBlock | undefined): string[] {
  const flow = block ? solidScriptGivenFlow(block) : undefined;
  if (!block || flow?.kind !== 'function') return [];
  return (block.values[flow.inputs] ?? '')
    .split(',')
    .map((input) => input.trim())
    .filter((input) => input !== '');
}

/**
 * Adds a Function and its inputs as Local. names.
 *
 * @param list Names so far.
 * @param block Function line.
 * @param line 0-based line.
 */
function solidScriptNamesOfFunction(list: SolidScriptNameList, block: SolidScriptBlock, line: number): void {
  const name = solidScriptGivenFlowName(block);
  const inputs = solidScriptNameInputs(block);
  list.add(name, 'Functions', line, `${name}(${(block.values['parameters'] ?? '').trim()})`);
  for (const input of inputs) list.add(`Local.${input}`, 'Locals', line, `input of ${name}()`);
}

/**
 * Lists the names a line at a position sees, each with the kinds it may hold
 * there: every name the script defines, except that a Function's locals show
 * only inside that Function, from its inputs and the Set local lines above, and
 * a loop's counter and values show only inside that loop. Lines turned off give
 * none.
 *
 * @param document Script.
 * @param position Index of the line, or where a new line goes.
 * @returns Names.
 */
export function solidScriptDocumentNamesAt(document: SolidScriptDocument, position: number): SolidScriptName[] {
  const open = solidScriptNamesOpen(document, position);
  const list = new SolidScriptNameList(true);
  for (const entry of solidScriptDocumentNames(document))
    if (!SOLID_SCRIPT_NAMES_SCOPED.includes(entry.category)) list.names.push(entry);
  const functionLine = open
    .filter((line) => {
      const block = document.blocks[line];
      return block !== undefined && solidScriptGivenFlow(block)?.kind === 'function';
    })
    .pop();
  if (functionLine !== undefined) solidScriptNamesLocals(list, document, functionLine, position);
  for (const line of open) {
    const block = document.blocks[line];
    if (block)
      for (const counter of solidScriptNameCounters(block)) list.add(counter.name, 'Counters', line, counter.detail);
  }
  return solidScriptNamesKinds(list.names, solidScriptDocumentFlowAt(document, position), document.blocks);
}

/**
 * Lists the block lines still open at a position, outermost first.
 *
 * @param document Script.
 * @param position Index of the line, or where a new line goes.
 * @returns 0-based lines.
 */
function solidScriptNamesOpen(document: SolidScriptDocument, position: number): number[] {
  const open: number[] = [];
  for (const { block, line } of solidScriptDocumentActiveLines(document.blocks, 0, position)) {
    const nesting = solidScriptBlockNesting(block);
    if (nesting === 'open') open.push(line);
    if (nesting === 'close') open.pop();
  }
  return open;
}

/**
 * Adds the locals a line inside a Function sees: its inputs and the Local.
 * names the lines above it write.
 *
 * @param list Names so far.
 * @param document Script.
 * @param functionLine 0-based line of the Function.
 * @param position Index of the line.
 */
function solidScriptNamesLocals(
  list: SolidScriptNameList,
  document: SolidScriptDocument,
  functionLine: number,
  position: number,
): void {
  const block = document.blocks[functionLine];
  const name = block ? solidScriptGivenFlowName(block) : '';
  for (const input of solidScriptNameInputs(block))
    list.add(`Local.${input}`, 'Locals', functionLine, `input of ${name}()`);
  for (const { block: inner, line } of solidScriptDocumentActiveLines(document.blocks, functionLine + 1, position))
    for (const { gives, name: target } of solidScriptGivenFields(inner))
      if ('what' in gives && /^local\./i.test(target))
        list.add(target, 'Locals', line, `${solidScriptGivenDetail(inner, gives.what)} in ${name}()`);
}

/**
 * Returns every line that gives each name a value, as the commands declare
 * their fields (a list by its plain name, so points() and points(2) count for
 * points), and Function inputs. Lines turned off give none.
 *
 * @param document Script.
 * @returns 0-based lines per name, in line order.
 */
export function solidScriptDocumentOrigins(document: SolidScriptDocument): Map<string, number[]> {
  const origins = new Map<string, number[]>();
  for (const { block, line } of solidScriptDocumentActiveLines(document.blocks))
    for (const target of solidScriptOriginTargets(block)) solidScriptOriginAdd(origins, target, line);
  return origins;
}

/**
 * Lists the names a line gives a value, as written: every field that writes one
 * except those that only read or forget it, and a Function's inputs.
 *
 * @param block Line.
 * @returns Names.
 */
function solidScriptOriginTargets(block: SolidScriptBlock): string[] {
  const written = solidScriptGivenFields(block)
    .filter(({ gives }) => gives.rule !== 'read' && gives.rule !== 'forgotten' && gives.rule !== 'defines')
    .map(({ name }) => name);
  return [...written, ...solidScriptNameInputs(block).map((input) => `Local.${input}`)];
}

/**
 * Adds a line to the lines of a name, by its plain name.
 *
 * @param origins Lines per name.
 * @param target Name as written.
 * @param line 0-based line.
 */
function solidScriptOriginAdd(origins: Map<string, number[]>, target: string, line: number): void {
  const name = solidScriptNameShown(target.trim())
    .replace(/\s*\(.*\)$/, '')
    .replace(/\.[xyzXYZ]$/, '');
  if (!SOLID_SCRIPT_NAME_PLAIN.test(name)) return;
  const lines = origins.get(name) ?? [];
  if (!lines.includes(line)) lines.push(line);
  origins.set(name, lines);
}

/** Names and Functions a field may use, by key. */
export interface SolidScriptFieldKnown {
  /**
   * Keys of the values: variables, inputs, counters, locals and names the
   * command fills in.
   */
  names: ReadonlySet<string>;
  /** Keys of the script's own Functions. */
  functions: ReadonlySet<string>;
}

/** A [name] or call in a field that nothing defines. */
export interface SolidScriptFieldUnknownName {
  /** Name as written. */
  written: string;
  /** Key it is looked up by; a call ends with (). */
  key: string;
  /** True for a call of a Function. */
  call: boolean;
}

/**
 * Collects what a field may use from the names a line sees.
 *
 * @param names Names the line sees.
 * @param extra Names the command fills in for its own formulas.
 * @returns Known keys.
 */
export function solidScriptFieldKnown(
  names: readonly SolidScriptName[],
  extra: readonly string[],
): SolidScriptFieldKnown {
  const values = names.filter((entry) => !['Functions', 'Parts', 'Handlers'].includes(entry.category));
  return {
    names: new Set([...values.map((entry) => entry.name), ...extra].map(solidScriptNameKey)),
    functions: new Set(
      names.filter((entry) => entry.category === 'Functions').map((entry) => solidScriptFunctionKey(entry.name)),
    ),
  };
}

/**
 * Returns the [name] references and calls of a field that nothing defines, each
 * once: names no line sets, Local. names the Function does not have, and calls
 * of functions that are neither built in nor a Function of the script. Names
 * built from other names and Persistent. names are skipped.
 *
 * @param text Field text.
 * @param known What the field may use.
 * @returns Unknown names in field order.
 */
export function solidScriptFieldUnknown(text: string, known: SolidScriptFieldKnown): SolidScriptFieldUnknownName[] {
  const unknown: SolidScriptFieldUnknownName[] = [];
  for (const token of solidScriptFieldTokens(text)) {
    const key = solidScriptFieldTokenKey(text, token);
    if (key === null || unknown.some((entry) => entry.key === key)) continue;
    const written = text.slice(token.from, token.to);
    const call = token.kind === 'function';
    const found = call
      ? known.functions.has(key.slice(0, -2)) || solidScriptBuiltinFind(written) !== undefined
      : known.names.has(key);
    if (!found) unknown.push({ written: call ? written : solidScriptFieldUnknownWritten(written), key, call });
  }
  return unknown;
}

/**
 * Gives the part of a name as written that names the variable, without its
 * members: Local.X for Local.X.Faces, Henry for Henry.Faces.
 *
 * @param written Name as written.
 * @returns Variable name.
 */
function solidScriptFieldUnknownWritten(written: string): string {
  return written
    .split('.')
    .slice(0, /^local\./i.test(written) ? 2 : 1)
    .join('.');
}

/**
 * Finds, without running the script, the names and calls each line reads that
 * it cannot see, for the editor's squiggles: what the line's fields use against
 * the names at that line. Lines that are off are skipped.
 *
 * @param document Script.
 * @returns Unknown keys per 0-based line, only for lines that have any.
 */
export function solidScriptDocumentNamesUnknown(document: SolidScriptDocument): Map<number, Set<string>> {
  const unknown = new Map<number, Set<string>>();
  for (const { block, line } of solidScriptDocumentActiveLines(document.blocks)) {
    const command = solidScriptCommandFind(block.command);
    if (!command) continue;
    const texts = command.parameters
      .filter((parameter) => !solidScriptFieldAsTyped(parameter))
      .map((parameter) => block.values[parameter.key] ?? '')
      .filter((text) => /[[(]/.test(text));
    if (texts.length === 0) continue;
    const known = solidScriptFieldKnown(solidScriptDocumentNamesAt(document, line), command.fills);
    const keys = new Set(texts.flatMap((text) => solidScriptFieldUnknown(text, known).map((entry) => entry.key)));
    if (keys.size > 0) unknown.set(line, keys);
  }
  return unknown;
}

/**
 * Tells whether a script defines a name anywhere, such as a variable Box, so a
 * bracket name starting with it is no system value missing its $.
 *
 * @param document Script.
 * @returns Test by name, in any case.
 */
export function solidScriptDocumentDefines(document: SolidScriptDocument): (name: string) => boolean {
  const names = new Set(solidScriptDocumentNames(document).map((entry) => solidScriptNameKey(entry.name)));
  return (name) => names.has(solidScriptNameKey(name));
}
