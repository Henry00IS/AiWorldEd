import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import { SOLID_SCRIPT_KINDS } from '@/solid_script/language/solid_script_kinds.js';
import { SOLID_SCRIPT_MEMBER_DECLS } from '@/solid_script/language/solid_script_members.js';
import { SOLID_SCRIPT_SYSTEM_LISTED } from '@/solid_script/language/solid_script_system.js';
import { SOLID_SCRIPT_SYSTEM_FILLS } from '@/solid_script/language/solid_script_system_names.js';
import { SOLID_SCRIPT_WHERE_HELPERS } from '@/solid_script/language/solid_script_where_helpers.js';
import { solidScriptReference } from '@/solid_script/reference/solid_script_reference.js';
import { MCP_SERVER_INSTRUCTIONS } from '@/ai/shared/mcp_instructions.js';

/** Folders whose source text a SolidScript user can read in messages. */
const SOURCE_FOLDERS = ['src/solid_script', 'src/modifier/stack/kinds/generator/solid_script'];

/**
 * Collects every string inside a value, object keys included, except search
 * synonyms, which may keep the words people know from other editors.
 *
 * @param value Any value.
 * @param into Strings found.
 * @returns Strings found.
 */
function strings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, into);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      if (key === 'synonyms') continue;
      into.push(key);
      strings(item, into);
    }
  return into;
}

/**
 * Lists the TypeScript files below a folder.
 *
 * @param folder Folder.
 * @returns File paths.
 */
function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/**
 * Finds the quoted texts of a source file that read as words for people: with a
 * space or a capital, outside comments and imports.
 *
 * @param path File.
 * @returns Quoted texts.
 */
function quoted(path: string): string[] {
  const text = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|import |} from )/.test(line))
    .join('\n');
  return [...text.matchAll(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g)]
    .map((match) => match[0].replace(/\$\{[^}]*\}/g, ''))
    .filter((literal) => !/^.[a-z0-9_.$/@-]*.$/.test(literal));
}

/** Every text a SolidScript user reads: catalogs, help, examples and docs. */
function shown(): string[] {
  return [
    ...strings(solidScriptCommands),
    ...strings(SOLID_SCRIPT_FUNCTION_DOCS),
    ...strings(SOLID_SCRIPT_KINDS),
    ...strings(SOLID_SCRIPT_MEMBER_DECLS),
    ...strings(SOLID_SCRIPT_SYSTEM_LISTED),
    ...strings(SOLID_SCRIPT_SYSTEM_FILLS),
    ...strings(SOLID_SCRIPT_WHERE_HELPERS),
    ...strings(SOLID_SCRIPT_EXAMPLES),
    solidScriptReference(),
    readFileSync('documentation/solidscript.md', 'utf8'),
    ...MCP_SERVER_INSTRUCTIONS.split('\n').filter((line) => /solid ?script|geometry_script/i.test(line)),
  ];
}

/**
 * Lists the texts that use a word.
 *
 * @param texts Texts.
 * @param word Pattern of the word.
 * @returns Texts with it, shortened around the word.
 */
function using(texts: readonly string[], word: RegExp): string[] {
  return texts.flatMap((text) => {
    const at = text.search(word);
    return at < 0 ? [] : [text.slice(Math.max(0, at - 40), at + 40)];
  });
}

describe('SolidScript says Objects, Solids and Meshes, never brushes', () => {
  const brush = /\bbrush(es)?\b/i;
  it('in its catalogs, help, examples and docs', () => {
    expect(using(shown(), brush)).toEqual([]);
  });
  it('in the messages of its source', () => {
    const files = SOURCE_FOLDERS.flatMap(sources);
    expect(files.flatMap((file) => using(quoted(file), brush).map((text) => `${file}: ${text}`))).toEqual([]);
  });
});

describe('SolidScript says Path, never outline or Curve To Mesh', () => {
  const words = /\boutlines?\b|Curve To Mesh/i;
  it('in its catalogs, help, examples and docs', () => {
    expect(using(shown(), words)).toEqual([]);
  });
  it('in the messages of its source', () => {
    const files = SOURCE_FOLDERS.flatMap(sources).filter((file) => !file.endsWith('_css.ts'));
    expect(files.flatMap((file) => using(quoted(file), words).map((text) => `${file}: ${text}`))).toEqual([]);
  });
});

/**
 * Finds a command of the catalog by its label.
 *
 * @param label Label.
 * @returns Command.
 */
function command(label: string) {
  const found = solidScriptCommands.find((entry) => entry.label === label);
  expect(found, label).toBeTruthy();
  return found as NonNullable<typeof found>;
}

/**
 * Reads the hint of a field of a command.
 *
 * @param label Command label.
 * @param key Field key.
 * @returns Hint.
 */
function hint(label: string, key: string): string {
  return command(label).parameters.find((parameter) => parameter.key === key)?.hint ?? '';
}

describe('SolidScript says objects where meshes work as well as solids', () => {
  it('in the blocks that build, wrap or pick from objects', () => {
    for (const label of ['Select Faces', 'Place On Face', 'Place At Points', 'Texture', 'Hull', 'Output'])
      expect(command(label).description, label).toMatch(/\bobjects\b/);
  });

  it('in the Of and On fields that take objects', () => {
    for (const label of ['Points From Faces', 'Points From Edges', 'Points From Vertices'])
      expect(hint(label, 'of'), label).toMatch(/\bobjects\b/);
    expect(hint('Transform', 'on')).toMatch(/^Face or object\b/);
    expect(hint('Output', 'of')).toMatch(/\bobjects\b/);
  });

  it('in the messages of lines given the wrong kind', () => {
    const wrong =
      /takes (faces|edges, faces|vertices, faces) or solids|holds faces or solids|picks from solids|holds solids, faces|one face or one solid|single face or solid|takes a face or a solid|part or solids/;
    const files = sources('src/solid_script');
    expect(files.flatMap((file) => (wrong.test(readFileSync(file, 'utf8')) ? [file] : []))).toEqual([]);
  });
});
