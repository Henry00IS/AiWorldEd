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

/**
 * Read-only values each loop line gives the lines inside it, with what they
 * hold.
 */
const SOLID_SCRIPT_NAMES_SYSTEM: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  for_each_selected_face: [
    ['Face.Index', 'round number, from 0'],
    ['Face.Number', 'number of the face among all faces'],
    ['Face.Center', 'middle of the face'],
    ['Face.Normal', 'way the face points'],
    ['Face.Width', 'width of the face'],
    ['Face.Height', 'height of the face'],
    ['Face.Area', 'area of the face'],
    ['Face.Tag', 'name of the face, such as Top'],
  ],
  for_each_vertex: [
    ['Vertex.Index', 'number of the corner'],
    ['Vertex.Position', 'where the corner is'],
    ['Vertex.Normal', 'way the faces around it point'],
  ],
  for_each_scattered_point: [
    ['Point.Index', 'number of the point, from 0'],
    ['Point.Position', 'where the point is'],
    ['Point.Normal', 'way its face points'],
    ['Face.Center', 'middle of its face'],
    ['Face.Tag', 'name of its face, such as Top'],
  ],
  for_each_brush: [
    ['Brush.Index', 'round number, from 0'],
    ['Brush.Name', 'name of the brush, for Of fields'],
    ['Brush.Center', 'middle of the brush'],
    ['Brush.Size', 'width, height and depth of the brush'],
    ['Brush.Extents', 'half the size: from the middle to the sides'],
    ['Brush.Min', 'lowest corner of the brush'],
    ['Brush.Max', 'highest corner of the brush'],
  ],
  for_each_edge: [
    ['Edge.Index', 'number of the edge'],
    ['Edge.Start', 'where the edge starts'],
    ['Edge.End', 'where the edge ends'],
    ['Edge.Middle', 'middle of the edge'],
    ['Edge.Length', 'length of the edge'],
    ['Edge.Direction', 'way the edge runs'],
  ],
};

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
 * Pressed lines. Names built from other names, such as part[i], are left out.
 *
 * @param document Script.
 * @returns Names.
 */
export function solidScriptDocumentNames(document: SolidScriptDocument): SolidScriptName[] {
  const names: SolidScriptName[] = [];
  const add = (name: string, category: SolidScriptNameCategory, line: number, detail: string): void => {
    const plain = solidScriptNameShown(name.trim());
    if (!SOLID_SCRIPT_NAME_PLAIN.test(plain)) return;
    if (names.some((known) => known.name === plain && known.category === category)) return;
    names.push({ name: plain, category, line, detail });
  };
  document.blocks.forEach((block, line) => {
    const value = (key: string): string => block.values[key] ?? '';
    if (block.command === 'input') add(value('name'), 'Inputs', line, `${value('type') || 'number'} input`);
    if (block.command === 'variable') {
      const target = value('name').trim();
      const list = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(.*\)$/.exec(target);
      if (list) add(list[1] ?? '', 'Lists', line, 'list');
      else if (/^local\./i.test(target)) add(target, 'Locals', line, `set to ${value('value')} in a Function`);
      else if (/^persistent\./i.test(target)) add(target, 'Persistent', line, 'kept between runs');
      else add(target, 'Variables', line, `set to ${value('value')}`);
    }
    if (block.command === 'call' && value('result').trim() !== '')
      add(value('result'), 'Variables', line, `returned by ${value('name').trim()}()`);
    if (block.command === 'add_item' || block.command === 'insert_item') add(value('list'), 'Lists', line, 'list');
    if (block.command === 'find_item') add(value('result'), 'Variables', line, `position in ${value('list').trim()}`);
    for (const [system, detail] of SOLID_SCRIPT_NAMES_SYSTEM[block.command] ?? [])
      if (!names.some((known) => known.name === system)) names.push({ name: system, category: 'System', line, detail });
    if (block.command === 'repeat' || block.command === 'for_each')
      add(value('variable'), 'Counters', line, block.command === 'repeat' ? 'Repeat counter' : 'For Each item');
    if (block.command === 'function') {
      add(value('name'), 'Functions', line, `${value('name').trim()}(${value('parameters').trim()})`);
      for (const parameter of value('parameters').split(','))
        if (parameter.trim() !== '')
          add(`Local.${parameter.trim()}`, 'Locals', line, `input of ${value('name').trim()}()`);
    }
    if (block.command === 'part') add(value('name'), 'Parts', line, 'Define Part');
    if (value('label').trim() !== '') add(value('label'), 'Brushes', line, `Name of a ${block.command} line`);
    if (block.command === 'when_input_changes') add(value('name'), 'Handlers', line, 'When Input Changes');
    if (block.command === 'when_button_pressed') add(value('name'), 'Handlers', line, 'When Button Pressed');
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
  const add = (name: string, category: SolidScriptNameCategory, line: number, detail: string): void => {
    const plain = solidScriptNameShown(name.trim());
    const valid = category === 'System' || SOLID_SCRIPT_NAME_PLAIN.test(plain);
    if (valid && !names.some((known) => known.name === plain)) names.push({ name: plain, category, line, detail });
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
      add(
        block.values['variable'] ?? '',
        'Counters',
        line,
        block.command === 'repeat' ? 'Repeat counter' : 'For Each item',
      );
    for (const [system, detail] of SOLID_SCRIPT_NAMES_SYSTEM[block.command] ?? []) add(system, 'System', line, detail);
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
    if (!found) unknown.push({ written: call ? written : written.replace(/\.[xyzXYZ]$/, ''), key, call });
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
