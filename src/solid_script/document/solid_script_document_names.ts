import type { SolidScriptDocument } from './solid_script_document.js';

/** Kinds of name a script defines, in the order the editor lists them. */
export const SOLID_SCRIPT_NAME_CATEGORIES = [
  'Inputs',
  'Variables',
  'Lists',
  'Counters',
  'Functions',
  'Parts',
  'Events',
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

/** Pattern of a plain name. */
const SOLID_SCRIPT_NAME_PLAIN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Lists the names a script defines, in line order, each once per kind: Input,
 * Set, Repeat and For Each counters, Define Function, Define Part and When
 * Event lines. Names built from other names, such as part[i], are left out.
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
      else add(target, 'Variables', line, `set to ${value('value')}`);
    }
    if (block.command === 'repeat' || block.command === 'for_each')
      add(value('variable'), 'Counters', line, block.command === 'repeat' ? 'Repeat counter' : 'For Each item');
    if (block.command === 'function')
      add(value('name'), 'Functions', line, `${value('name').trim()}(${value('parameters').trim()})`);
    if (block.command === 'part') add(value('name'), 'Parts', line, 'Define Part');
    if (block.command === 'event') add(value('name'), 'Events', line, 'When Event');
  });
  return names;
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
