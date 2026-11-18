import type { SolidScriptDocument } from './solid_script_document.js';
import { solidScriptBlockNesting, solidScriptDocumentOffLines } from './solid_script_document_indent.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptBuiltinFind } from '@/solid_script/language/solid_script_expression_compile.js';
import { solidScriptFieldTokenKey, solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';
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
   * Kind it holds when a Type declares it or the line that writes it tells,
   * such as Face List.
   */
  type?: string;
  /**
   * Text it is read from, for a guess at its kind: a Set value, or the list a
   * For Each walks.
   */
  from?: { text: string; item: boolean };
}

/**
 * Names that commands make for their own formulas: what Displace and Extrude
 * Faces fill in for every point or face.
 */
export const SOLID_SCRIPT_NAMES_COMMAND: Readonly<Record<string, readonly string[]>> = {
  displace: ['x', 'y', 'z', 'nx', 'ny', 'nz', 'index'],
  extrude_faces: ['nx', 'ny', 'nz', 'cx', 'cy', 'cz', 'index'],
};

/** Pattern of a plain name, or of a Function's own variable. */
const SOLID_SCRIPT_NAME_PLAIN = /^(Local\.|Persistent\.)?[A-Za-z_][A-Za-z0-9_]*$/;

/** Fields that write a variable, with what it then holds. */
const SOLID_SCRIPT_NAMES_WRITTEN: Readonly<Record<string, string>> = {
  into: 'what is made',
  top: 'top faces',
  sides: 'side faces',
  inner: 'inner faces',
  ring: 'ring faces',
  normals: 'face directions',
};

/** Kinds the variables that face lines write hold, by command and field. */
const SOLID_SCRIPT_NAMES_WRITTEN_TYPES: Readonly<Record<string, string>> = {
  'select_faces.into': 'Face List',
  'select_edges.into': 'Edge List',
  'select_vertices.into': 'Vertex List',
  'extrude_face.into': 'Brush List',
  'extrude_face.top': 'Face List',
  'extrude_face.sides': 'Face List',
  'inset_face.inner': 'Face List',
  'inset_face.ring': 'Face List',
  'bevel_edges.into': 'Face List',
  'scatter_points.into': 'Vector List',
  'scatter_points.normals': 'Vector List',
  'input_brushes.into': 'Brush List',
};

/**
 * Tells the kind a field that writes a variable gives it: what a face line
 * writes, or the brush a building block built.
 *
 * @param command Command id.
 * @param key Field key.
 * @returns The kind, or nothing when unknown.
 */
function solidScriptNameWrittenType(command: string, key: string): { type?: string } {
  const known = SOLID_SCRIPT_NAMES_WRITTEN_TYPES[`${command}.${key}`];
  if (known) return { type: known };
  return key === 'into' && solidScriptCommandFind(command)?.builds === true ? { type: 'Brush' } : {};
}

/**
 * Lists the variables a line's fields surely write with the kind each gets,
 * such as the Brush a Cube writes to Into or the Face List of Select Faces.
 *
 * @param block Line.
 * @returns Variable names as written, without brackets, and their kinds.
 */
export function solidScriptNameWrittenKinds(
  block: SolidScriptDocument['blocks'][number],
): { name: string; kind: string }[] {
  return Object.keys(SOLID_SCRIPT_NAMES_WRITTEN).flatMap((key) => {
    const name = (block.values[key] ?? '').trim().replace(/^\[(.*)\]$/s, '$1');
    const kind = solidScriptNameWrittenType(block.command, key).type;
    return name !== '' && kind !== undefined ? [{ name, kind }] : [];
  });
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
 * Lists the counters a Repeat or For Each line gives the lines inside it: the
 * counter or item, and the For Each Key, with their kinds.
 *
 * @param block Repeat or For Each line.
 * @returns Counters.
 */
function solidScriptNameCounters(
  block: SolidScriptDocument['blocks'][number],
): { name: string; detail: string; kind: Pick<SolidScriptName, 'type' | 'from'> }[] {
  const value = (key: string): string => block.values[key] ?? '';
  const loop = solidScriptNameBlock(block.command);
  if (block.command === 'repeat')
    return [{ name: value('variable'), detail: `counter of ${loop}`, kind: { type: 'Number' } }];
  // The Key is a number for a list and a text for a Data value, so its kind stays open.
  const item = {
    name: value('variable'),
    detail: `item of ${loop}`,
    kind: { from: { text: value('list'), item: true } },
  };
  const key = { name: value('key'), detail: `key of ${loop}`, kind: {} };
  return value('key').trim() === '' ? [item] : [item, key];
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
 * Lists the names a script defines, in line order, each once per kind: Input,
 * Set, Call results, Repeat and For Each counters, Function inputs as
 * Local.Name, Define Part, shape Names, When Input Changes and When Button
 * Pressed lines. Names built from other names, such as part[i], are left out. A
 * Type a Set declares wins over the kind another line writing the name gives.
 *
 * @param document Script.
 * @returns Names.
 */
export function solidScriptDocumentNames(document: SolidScriptDocument): SolidScriptName[] {
  const names: SolidScriptName[] = [];
  const add = (
    name: string,
    category: SolidScriptNameCategory,
    line: number,
    detail: string,
    kind: Pick<SolidScriptName, 'type' | 'from'> = {},
  ): void => {
    const plain = solidScriptNameShown(name.trim());
    if (!SOLID_SCRIPT_NAME_PLAIN.test(plain)) return;
    const known = names.find((entry) => entry.name === plain && entry.category === category);
    if (known === undefined) names.push({ name: plain, category, line, detail, ...kind });
    else if (kind.type && kind.from && !(known.type && known.from)) Object.assign(known, kind);
  };
  document.blocks.forEach((block, line) => {
    const value = (key: string): string => block.values[key] ?? '';
    if (block.command === 'input') add(value('name'), 'Inputs', line, `${value('type') || 'number'} input`);
    if (block.command === 'variable') {
      const target = value('name').trim();
      const list = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(.*\)$/.exec(target);
      if (list) add(list[1] ?? '', 'Lists', line, 'list');
      else if (/^local\./i.test(target))
        add(target, 'Locals', line, `set to ${value('value')} in a ${solidScriptNameBlock('function')}`);
      else if (/^persistent\./i.test(target)) add(target, 'Persistent', line, 'kept between runs');
      else
        add(target, 'Variables', line, `set to ${value('value')}`, {
          ...(['', 'Any'].includes(value('type').trim()) ? {} : { type: value('type').trim() }),
          from: { text: value('value'), item: false },
        });
    }
    if (block.command === 'call' && value('result').trim() !== '')
      add(value('result'), 'Variables', line, `returned by ${value('name').trim()}()`);
    if (block.command === 'add_item' || block.command === 'insert_item') add(value('list'), 'Lists', line, 'list');
    if (block.command === 'find_item') add(value('result'), 'Variables', line, `position in ${value('list').trim()}`);
    for (const [key, detail] of Object.entries(SOLID_SCRIPT_NAMES_WRITTEN))
      if (value(key).trim() !== '')
        add(
          value(key).replace(/^\[(.*)\]$/s, '$1'),
          'Variables',
          line,
          `${detail} of ${solidScriptNameBlock(block.command)}`,
          {
            ...solidScriptNameWrittenType(block.command, key),
          },
        );
    if (block.command === 'repeat' || block.command === 'for_each')
      for (const counter of solidScriptNameCounters(block))
        add(counter.name, 'Counters', line, counter.detail, counter.kind);
    if (block.command === 'function') {
      add(value('name'), 'Functions', line, `${value('name').trim()}(${value('parameters').trim()})`);
      for (const parameter of value('parameters').split(','))
        if (parameter.trim() !== '')
          add(`Local.${parameter.trim()}`, 'Locals', line, `input of ${value('name').trim()}()`);
    }
    if (block.command === 'part') add(value('name'), 'Parts', line, solidScriptNameBlock('part'));
    if (value('label').trim() !== '')
      add(value('label'), 'Brushes', line, `Name of a ${solidScriptNameBlock(block.command)} line`);
    if (block.command === 'when_input_changes')
      add(value('name'), 'Handlers', line, solidScriptNameBlock(block.command));
    if (block.command === 'when_button_pressed')
      add(value('name'), 'Handlers', line, solidScriptNameBlock(block.command));
  });
  return names;
}

/** Categories whose names only some lines see: Function locals and loop values. */
const SOLID_SCRIPT_NAMES_SCOPED: readonly SolidScriptNameCategory[] = ['Locals', 'Counters', 'System'];

/**
 * Lists the names a line at a position sees: every name the script defines,
 * except that a Function's locals show only inside that Function, from its
 * inputs and the Set local lines above, and a loop's counter and values show
 * only inside that loop.
 *
 * @param document Script.
 * @param position Index of the line, or where a new line goes.
 * @returns Names.
 */
export function solidScriptDocumentNamesAt(document: SolidScriptDocument, position: number): SolidScriptName[] {
  const open: number[] = [];
  document.blocks.slice(0, position).forEach((block, line) => {
    const nesting = solidScriptBlockNesting(block);
    if (nesting === 'open') open.push(line);
    if (nesting === 'close') open.pop();
  });
  const names = solidScriptDocumentNames(document).filter(
    (entry) => !SOLID_SCRIPT_NAMES_SCOPED.includes(entry.category),
  );
  const add = (
    name: string,
    category: SolidScriptNameCategory,
    line: number,
    detail: string,
    kind: Pick<SolidScriptName, 'type' | 'from'> = {},
  ): void => {
    const plain = solidScriptNameShown(name.trim());
    const valid = category === 'System' || SOLID_SCRIPT_NAME_PLAIN.test(plain);
    if (valid && !names.some((known) => known.name === plain))
      names.push({ name: plain, category, line, detail, ...kind });
  };
  const functionLine = open.filter((line) => document.blocks[line]?.command === 'function').pop();
  if (functionLine !== undefined) {
    const block = document.blocks[functionLine]!;
    const name = (block.values['name'] ?? '').trim();
    for (const parameter of (block.values['parameters'] ?? '').split(','))
      if (parameter.trim() !== '') add(`Local.${parameter.trim()}`, 'Locals', functionLine, `input of ${name}()`);
    document.blocks.slice(functionLine + 1, position).forEach((inner, offset) => {
      const target = (inner.values['name'] ?? '').trim();
      if (inner.command === 'variable' && /^local\./i.test(target))
        add(target, 'Locals', functionLine + 1 + offset, `set to ${inner.values['value'] ?? ''} in ${name}()`);
    });
  }
  for (const line of open) {
    const block = document.blocks[line]!;
    if (block.command === 'repeat' || block.command === 'for_each')
      for (const counter of solidScriptNameCounters(block))
        add(counter.name, 'Counters', line, counter.detail, counter.kind);
  }
  return names;
}

/**
 * Returns every line that gives each name a value: Input, Set (a list by its
 * plain name, so points() and points(2) count for points), Remove Item, Call
 * results, Repeat and For Each counters and Function inputs.
 *
 * @param document Script.
 * @returns 0-based lines per name, in line order.
 */
export function solidScriptDocumentOrigins(document: SolidScriptDocument): Map<string, number[]> {
  const origins = new Map<string, number[]>();
  const add = (target: string, line: number): void => {
    const name = solidScriptNameShown(target.trim())
      .replace(/\s*\(.*\)$/, '')
      .replace(/\.[xyzXYZ]$/, '');
    if (!SOLID_SCRIPT_NAME_PLAIN.test(name)) return;
    const lines = origins.get(name) ?? [];
    if (!lines.includes(line)) lines.push(line);
    origins.set(name, lines);
  };
  document.blocks.forEach((block, line) => {
    const value = (key: string): string => block.values[key] ?? '';
    if (block.command === 'input' || block.command === 'variable') add(value('name'), line);
    if (block.command === 'remove_item') add(value('target'), line);
    if (['add_item', 'insert_item', 'remove_value', 'sort_list', 'reverse_list'].includes(block.command))
      add(value('list'), line);
    if (block.command === 'find_item') add(value('result'), line);
    if (block.command === 'clear_variable') add(value('name'), line);
    if (block.command === 'call' && value('result').trim() !== '') add(value('result'), line);
    if (block.command === 'repeat' || block.command === 'for_each') add(value('variable'), line);
    if (block.command === 'function')
      for (const parameter of value('parameters').split(','))
        if (parameter.trim() !== '') add(`Local.${parameter.trim()}`, line);
  });
  return origins;
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

/** Field kinds whose text is used as typed, without [name] or formulas. */
export const SOLID_SCRIPT_NAMES_RAW: ReadonlySet<string> = new Set(['name', 'target', 'text']);

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
    if (!found)
      unknown.push({
        written: call
          ? written
          : written
              .split('.')
              .slice(0, /^local\./i.test(written) ? 2 : 1)
              .join('.'),
        key,
        call,
      });
  }
  return unknown;
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
  const off = solidScriptDocumentOffLines(document);
  document.blocks.forEach((block, line) => {
    const command = solidScriptCommandFind(block.command);
    if (!command || off[line]) return;
    const texts = command.parameters
      .filter((parameter) => !SOLID_SCRIPT_NAMES_RAW.has(parameter.type))
      .map((parameter) => block.values[parameter.key] ?? '')
      .filter((text) => /[[(]/.test(text));
    if (texts.length === 0) return;
    const known = solidScriptFieldKnown(
      solidScriptDocumentNamesAt(document, line),
      SOLID_SCRIPT_NAMES_COMMAND[command.id] ?? [],
    );
    const keys = new Set(texts.flatMap((text) => solidScriptFieldUnknown(text, known).map((entry) => entry.key)));
    if (keys.size > 0) unknown.set(line, keys);
  });
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
