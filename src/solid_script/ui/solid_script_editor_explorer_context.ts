import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentFlowAt } from '@/solid_script/document/solid_script_document_flow.js';
import type { SolidScriptFlowState } from '@/solid_script/document/solid_script_document_flow_state.js';
import { solidScriptGivenFields } from '@/solid_script/document/solid_script_document_gives.js';
import {
  solidScriptDocumentNamesAt,
  solidScriptNameKindsText,
  solidScriptNameShown,
  type SolidScriptName,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import {
  SOLID_SCRIPT_SYSTEM_CATALOG,
  type SolidScriptSystemCatalogEntry,
} from '@/solid_script/language/solid_script_system_names.js';
import type { SolidScriptVariable } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptExplorerEntry } from './solid_script_editor_explorer.js';

/** Type shown for a name whose kind only running tells. */
const SOLID_SCRIPT_CONTEXT_KIND_UNKNOWN = 'Known When It Runs';

/** Name categories that hold a value a line can read. */
const SOLID_SCRIPT_CONTEXT_HOLDING: ReadonlySet<string> = new Set([
  'Inputs',
  'Variables',
  'Lists',
  'Counters',
  'Locals',
  'Persistent',
]);

/** Name categories listed only where they are in scope, set or not. */
const SOLID_SCRIPT_CONTEXT_SCOPED: ReadonlySet<string> = new Set(['Counters', 'Locals']);

/** System lists every line can read, such as $Selected.Faces. */
const SOLID_SCRIPT_CONTEXT_SELECTED = SOLID_SCRIPT_SYSTEM_CATALOG.filter((entry) =>
  entry.name.startsWith('$Selected.'),
);

/**
 * Lists what a line can read just before it runs, as the checks follow the
 * script without running it: the names set or in scope there with the kinds
 * they may hold, a Function's inputs inside it, a loop's counter inside it, the
 * selected lists, the values the line fills for its own fields, and the names
 * the line itself sets, marked as set here.
 *
 * @param script Script.
 * @param line 0-based line.
 * @param live Values by shown name as the line sees them, from where the run
 *   stopped, the last time the line ran, or where the run's values were
 *   captured; or null.
 * @returns Entries; empty when the line is not in the script.
 */
export function solidScriptExplorerContextEntries(
  script: SolidScriptDocument,
  line: number,
  live: ReadonlyMap<string, SolidScriptVariable> | null,
): SolidScriptExplorerEntry[] {
  const block = script.blocks[line];
  if (!block) return [];
  const before = solidScriptDocumentFlowAt(script, line);
  const entries = solidScriptDocumentNamesAt(script, line)
    .filter((name) => solidScriptContextReadable(name, before))
    .map((name) => solidScriptContextNameEntry(name, live));
  solidScriptContextWritesMark(entries, script, line);
  const fills = solidScriptExplorerFills(script, line);
  const filled = SOLID_SCRIPT_SYSTEM_CATALOG.filter((entry) => fills.includes(entry.name));
  const fillText = live ? solidScriptExplorerFillText(line) : null;
  return [
    ...entries,
    ...SOLID_SCRIPT_CONTEXT_SELECTED.map((entry) => {
      const found = live?.get(entry.name);
      return solidScriptContextSystemEntry(entry, '', found?.value ?? null, found?.items ?? []);
    }),
    ...filled.map((entry) =>
      solidScriptContextSystemEntry(entry, ', filled by this line for its own fields', fillText, []),
    ),
  ];
}

/**
 * Lists the names a line fills for its own fields, such as $NZ.
 *
 * @param script Script.
 * @param line 0-based line.
 * @returns Official fill names; empty when the line fills none.
 */
export function solidScriptExplorerFills(script: SolidScriptDocument, line: number): readonly string[] {
  const block = script.blocks[line];
  return (block && solidScriptCommandFind(block.command)?.fills) ?? [];
}

/**
 * Says when a fill holds a value: for each element in turn while its line runs,
 * so a run stopped before the line has none yet.
 *
 * @param line 0-based line that fills it.
 * @returns Text shown as its value.
 */
export function solidScriptExplorerFillText(line: number): string {
  return `Set for Each Element While Line ${line + 1} Runs`;
}

/**
 * Tells whether a line can read a name: a name that holds a value and is set
 * where the line stands, or a counter or Function input in scope there.
 *
 * @param name Name with its kinds at the line.
 * @param before Variables just before the line runs.
 * @returns True when the line can read it.
 */
function solidScriptContextReadable(name: SolidScriptName, before: SolidScriptFlowState): boolean {
  if (!SOLID_SCRIPT_CONTEXT_HOLDING.has(name.category)) return false;
  return SOLID_SCRIPT_CONTEXT_SCOPED.has(name.category) || before.has(solidScriptNameKey(name.name));
}

/**
 * Builds the entry of a name a line can read.
 *
 * @param name Name with its kinds at the line.
 * @param live Values by shown name as the line sees them, or null.
 * @returns Entry.
 */
function solidScriptContextNameEntry(
  name: SolidScriptName,
  live: ReadonlyMap<string, SolidScriptVariable> | null,
): SolidScriptExplorerEntry {
  const found = live?.get(solidScriptNameShown(name.name));
  return {
    name: name.name,
    category: name.category,
    value: found?.value ?? null,
    type: solidScriptNameKindsText(name.kinds) || SOLID_SCRIPT_CONTEXT_KIND_UNKNOWN,
    lines: name.reachLines ?? [name.line],
    ...(name.reachLines ? { reachLines: name.reachLines } : {}),
    items: found?.items ?? [],
    readOnly: name.category === 'Inputs',
    detail: '',
    reaches: name.reaches ?? '',
  };
}

/**
 * Marks the names a line sets as set here, and adds those it sets first.
 *
 * @param entries Entries of the names the line can read; changed in place.
 * @param script Script.
 * @param line 0-based line.
 */
function solidScriptContextWritesMark(
  entries: SolidScriptExplorerEntry[],
  script: SolidScriptDocument,
  line: number,
): void {
  const block = script.blocks[line];
  if (!block) return;
  const after = solidScriptDocumentFlowAt(script, line + 1);
  for (const given of solidScriptGivenFields(block)) {
    const key = solidScriptNameKey(given.name);
    const known = entries.find((entry) => solidScriptNameKey(entry.name) === key);
    if (known) known.setHere = true;
    else entries.push(solidScriptContextWrittenEntry(given.name, after, line));
  }
}

/**
 * Builds the entry of a name a line sets before anything else does.
 *
 * @param name Name as written.
 * @param after Variables just after the line.
 * @param line 0-based line.
 * @returns Entry.
 */
function solidScriptContextWrittenEntry(
  name: string,
  after: SolidScriptFlowState,
  line: number,
): SolidScriptExplorerEntry {
  const kinds = [...(after.get(solidScriptNameKey(name))?.kinds ?? [])];
  return {
    name: solidScriptNameShown(name),
    category: name.toLowerCase().startsWith('local.') ? 'Locals' : 'Variables',
    value: null,
    type: solidScriptNameKindsText(kinds) || SOLID_SCRIPT_CONTEXT_KIND_UNKNOWN,
    lines: [line],
    items: [],
    readOnly: false,
    detail: '',
    setHere: true,
  };
}

/**
 * Builds the entry of a system value a line can read.
 *
 * @param entry Catalog entry.
 * @param note Words added after what it holds.
 * @param value Value where the run stopped before the line, or null.
 * @param items Items of a list where the run stopped.
 * @returns Entry.
 */
function solidScriptContextSystemEntry(
  entry: SolidScriptSystemCatalogEntry,
  note: string,
  value: string | null,
  items: SolidScriptVariable[],
): SolidScriptExplorerEntry {
  return {
    name: entry.name,
    category: 'System',
    value,
    type: entry.type,
    lines: [],
    items,
    readOnly: true,
    detail: `${entry.detail}${note}`,
  };
}
