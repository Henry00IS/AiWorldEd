import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFlowPathKinds } from '@/solid_script/document/solid_script_document_flow_kinds.js';
import {
  SOLID_SCRIPT_SYSTEM_GLOBALS,
  SOLID_SCRIPT_SYSTEM_LISTED,
  SOLID_SCRIPT_SYSTEM_SELECTED,
} from '@/solid_script/language/solid_script_system.js';
import { SOLID_SCRIPT_SYSTEM_VALUES } from '@/solid_script/language/solid_script_name_rules.js';
import {
  SOLID_SCRIPT_SYSTEM_CATALOG,
  SOLID_SCRIPT_SYSTEM_FILLS,
} from '@/solid_script/language/solid_script_system_names.js';
import { solidScriptExplorerEntries } from '@/solid_script/ui/solid_script_editor_explorer.js';

/** Catalog names by their key, as system names ignore case. */
const CATALOG_KEYS = new Set(SOLID_SCRIPT_SYSTEM_CATALOG.map((entry) => entry.name.toLowerCase()));

/**
 * Lists every TypeScript source file below a folder.
 *
 * @param folder Folder path.
 * @returns File paths.
 */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/**
 * Returns the names a list holds that the catalog does not.
 *
 * @param names System names with their $.
 * @returns Missing names.
 */
function missingFromCatalog(names: Iterable<string>): string[] {
  return [...names].filter((name) => !CATALOG_KEYS.has(name.toLowerCase()));
}

/**
 * Collects every quoted match of a pattern in a source file.
 *
 * @param path File path, relative to the project.
 * @param pattern Pattern whose first group is the name.
 * @returns Names found.
 */
function sourceNames(path: string, pattern: RegExp): string[] {
  return [...readFileSync(path, 'utf8').matchAll(pattern)].map((match) => match[1] ?? '');
}

describe('the System tab lists every system name, no exceptions', () => {
  it('lists every catalog name exactly once in the System tab, even for an empty script', () => {
    const system = solidScriptExplorerEntries(solidScriptDocumentCreate([]), [], [])
      .filter((entry) => entry.category === 'System')
      .map((entry) => entry.name);
    expect(system).toEqual(SOLID_SCRIPT_SYSTEM_CATALOG.map((entry) => entry.name));
    expect(new Set(system.map((name) => name.toLowerCase())).size).toBe(system.length);
  });

  it('holds every registered selected list, built-in value and fill', () => {
    expect(missingFromCatalog(SOLID_SCRIPT_SYSTEM_SELECTED.map((value) => `$${value.name}`))).toEqual([]);
    expect(missingFromCatalog(SOLID_SCRIPT_SYSTEM_GLOBALS.map((value) => `$${value.name}`))).toEqual([]);
    expect(missingFromCatalog(SOLID_SCRIPT_SYSTEM_LISTED.map(([name]) => name))).toEqual([]);
    expect(missingFromCatalog(Object.keys(SOLID_SCRIPT_SYSTEM_FILLS))).toEqual([]);
    const grouped = Object.entries(SOLID_SCRIPT_SYSTEM_VALUES).flatMap(([group, members]) =>
      members.map((member) => `$${group}.${member}`),
    );
    expect(missingFromCatalog(grouped)).toEqual([]);
  });

  it('holds every name a command fills', () => {
    expect(missingFromCatalog(solidScriptCommands.flatMap((command) => command.fills))).toEqual([]);
  });

  it('holds every system list and built-in value the runtime reads', () => {
    const lists = sourceNames(
      'src/solid_script/language/solid_script_machine_variables.ts',
      /case '([a-z]+\.[a-z]+)':/g,
    );
    const readers = sourceNames(
      'src/solid_script/language/solid_script_system.ts',
      /'([A-Z][A-Za-z]*\.[A-Z][A-Za-z0-9]*)': \(\) =>/g,
    );
    expect(lists.length).toBeGreaterThan(0);
    expect(readers.length).toBeGreaterThan(0);
    expect(missingFromCatalog([...lists, ...readers].map((name) => `$${name}`))).toEqual([]);
  });

  it('holds every $ name the SolidScript sources spell out', () => {
    const spelled = sourceFiles('src/solid_script').flatMap((path) =>
      sourceNames(path, /['"`](\$[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*)/g),
    );
    const groups = new Set(SOLID_SCRIPT_SYSTEM_CATALOG.map((entry) => entry.name.split('.')[0]?.toLowerCase()));
    const unknown = spelled.filter((name) => !CATALOG_KEYS.has(name.toLowerCase()) && !groups.has(name.toLowerCase()));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it('gives the analyzer the kind of every catalog name', () => {
    const wrong = SOLID_SCRIPT_SYSTEM_CATALOG.filter((entry) => {
      const kinds = solidScriptFlowPathKinds(entry.name, () => []);
      return kinds.length !== 1 || kinds[0] !== entry.type;
    }).map((entry) => entry.name);
    expect(wrong).toEqual([]);
  });

  it('says why a value has no reading outside a run instead of leaving it blank', () => {
    const system = solidScriptExplorerEntries(solidScriptDocumentCreate([]), [], []).filter(
      (entry) => entry.category === 'System',
    );
    expect(system.filter((entry) => entry.value === null || !entry.detail).map((entry) => entry.name)).toEqual([]);
    expect(system.find((entry) => entry.name === '$Selected.Faces')?.value).toBe('Nothing Ran Yet');
    expect(system.find((entry) => entry.name === '$NZ')?.value).toBe('Only Inside Lines That Fill It');
  });
});
