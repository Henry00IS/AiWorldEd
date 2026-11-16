import type { SolidScriptDocument } from './solid_script_document.js';

/** Kinds of name a script defines, in the order the editor lists them. */
export const SOLID_SCRIPT_NAME_CATEGORIES = [
  'Inputs',
  'Variables',
  'Lists',
  'Counters',
  'Functions',
  'Locals',
  'Parts',
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
const SOLID_SCRIPT_NAME_PLAIN = /^(local\.|persistent\.)?[A-Za-z_][A-Za-z0-9_]*$/;

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
 * Lists the names a script defines, in line order, each once per kind: Input,
 * Set, Call results, Repeat and For Each counters, Function inputs as
 * local.name, Define Part, When Input Changes and When Button Pressed lines.
 * Names built from other names, such as part[i], are left out.
 *
 * @param document Script.
 * @returns Names.
 */
export function solidScriptDocumentNames(document: SolidScriptDocument): SolidScriptName[] {
  const names: SolidScriptName[] = [];
  const add = (name: string, category: SolidScriptNameCategory, line: number, detail: string): void => {
    const plain = name.trim();
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
      else if (target.startsWith('local.')) add(target, 'Locals', line, `set to ${value('value')} in a Function`);
      else if (target.startsWith('persistent.')) add(target, 'Persistent', line, 'kept between runs');
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
          add(`local.${parameter.trim()}`, 'Locals', line, `input of ${value('name').trim()}()`);
    }
    if (block.command === 'part') add(value('name'), 'Parts', line, 'Define Part');
    if (block.command === 'when_input_changes') add(value('name'), 'Handlers', line, 'When Input Changes');
    if (block.command === 'when_button_pressed') add(value('name'), 'Handlers', line, 'When Button Pressed');
  });
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
    const name = target.trim().replace(/\s*\(.*\)$/, '');
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
        if (parameter.trim() !== '') add(`local.${parameter.trim()}`, line);
  });
  return origins;
}

/**
 * Returns the [name] references of a field that no line of the script defines,
 * for a warning while configuring. Names built from other names are skipped.
 *
 * @param text Field text.
 * @param known Names a [name] may use.
 * @returns Unknown names, each once.
 */
export function solidScriptFieldNamesUnknown(text: string, known: ReadonlySet<string>): string[] {
  const unknown: string[] = [];
  const pattern = /\[([A-Za-z_][A-Za-z0-9_]*)(?=[\]()])/g;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > 0 && text[start - 1] === '$') continue;
    const name = match[1] ?? '';
    if (!known.has(name) && !unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}
