import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_NAME_CATEGORIES } from '@/solid_script/document/solid_script_document_names.js';
import type { SolidScriptVariable } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptSystemValues } from '@/solid_script/language/solid_script_system.js';
import {
  SOLID_SCRIPT_SYSTEM_CATALOG,
  type SolidScriptSystemCatalogEntry,
} from '@/solid_script/language/solid_script_system_names.js';
import { SolidScriptPathElement, solidScriptValueText } from '@/solid_script/language/solid_script_value.js';
import { SolidScriptResourceValues } from '@/solid_script/language/solid_script_resource_value.js';
import { solidScriptVariableView } from '@/solid_script/language/solid_script_machine_variables.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import type { SolidScriptResource } from '@/solid_script/document/solid_script_resource.js';
import type { SolidScriptExplorerEntry, SolidScriptExplorerSystemRun } from './solid_script_editor_explorer.js';
import { solidScriptExplorerFills, solidScriptExplorerFillText } from './solid_script_editor_explorer_context.js';

/**
 * Folds a name for sorting: without a leading $ and in lower case, so $Box
 * sorts among the B names.
 *
 * @param name Name.
 * @returns Sort key.
 */
function solidScriptExplorerSortKey(name: string): string {
  return name.replace(/^\$/, '').toLowerCase();
}

/**
 * Compares two names by letter, ignoring case and a leading $.
 *
 * @param left First name.
 * @param right Second name.
 * @returns Negative, zero or positive.
 */
export function solidScriptExplorerNameCompare(left: string, right: string): number {
  const a = solidScriptExplorerSortKey(left);
  const b = solidScriptExplorerSortKey(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Orders entries as the explorer lists them: by category, most important first,
 * then by letter within each category.
 *
 * @param entries Entries; sorted in place.
 * @returns The same entries.
 */
export function solidScriptExplorerSort<T extends Pick<SolidScriptExplorerEntry, 'name' | 'category'>>(
  entries: T[],
): T[] {
  const order = (entry: T): number => SOLID_SCRIPT_NAME_CATEGORIES.indexOf(entry.category);
  return entries.sort(
    (left, right) => order(left) - order(right) || solidScriptExplorerNameCompare(left.name, right.name),
  );
}

/**
 * Orders variables by letter, ignoring case and a leading $.
 *
 * @param variables Variables.
 * @returns Sorted copy.
 */
export function solidScriptExplorerVariablesSorted(variables: readonly SolidScriptVariable[]): SolidScriptVariable[] {
  return [...variables].sort((left, right) => solidScriptExplorerNameCompare(left.name, right.name));
}

/**
 * Builds the All and Resources-tab rows of each $Resources.Name from the same
 * items the System tab lists under $Resources, so both views stay in step.
 *
 * @param system System entries, including $Resources.
 * @returns One entry per resource.
 */
export function solidScriptExplorerResourceNameEntries(
  system: readonly SolidScriptExplorerEntry[],
): SolidScriptExplorerEntry[] {
  const held = system.find((entry) => entry.name === '$Resources')?.items ?? [];
  return held.map((item) => ({
    name: item.name,
    category: 'Resources',
    value: item.value,
    type: item.type,
    lines: [],
    items: item.items,
    readOnly: true,
    detail: '',
  }));
}

/**
 * Builds the entries of every system name, each with its value now or a
 * placeholder that says why it has none.
 *
 * @param script Script.
 * @param live Values of the run by shown name.
 * @param run System lists of the run and where it stopped.
 * @returns One entry per catalog name.
 */
export function solidScriptExplorerSystemEntries(
  script: SolidScriptDocument,
  live: ReadonlyMap<string, SolidScriptVariable>,
  run: SolidScriptExplorerSystemRun,
): SolidScriptExplorerEntry[] {
  const options = run.options;
  const system = solidScriptSystemValues(
    options?.context ?? 'generator',
    options?.box ?? null,
    false,
    options?.use,
    options?.pose,
    options?.corners,
  );
  const lists = new Map(run.system.map((list) => [list.name, list]));
  const filling = run.stoppedBefore === null ? [] : solidScriptExplorerFills(script, run.stoppedBefore);
  return SOLID_SCRIPT_SYSTEM_CATALOG.map((value) => {
    if (value.name === '$Resources') return solidScriptExplorerResourcesEntry(value, script);
    if (value.scoped) return solidScriptExplorerScopedEntry(value, live);
    const list = lists.get(value.name);
    const current = system.get(value.name.slice(1));
    if (list) return { ...solidScriptExplorerSystemEntry(value, list.value), items: list.items };
    if (current !== undefined) return solidScriptExplorerSystemEntry(value, solidScriptValueText(current));
    const entry = solidScriptExplorerSystemEntry(value, null);
    if (run.stoppedBefore !== null && filling.includes(value.name))
      entry.value = solidScriptExplorerFillText(run.stoppedBefore);
    return entry;
  });
}

/**
 * Builds the entry of a system name with its value, or its placeholder when
 * there is none.
 *
 * @param value Catalog entry.
 * @param shown Value now, or null.
 * @returns Entry without items.
 */
function solidScriptExplorerSystemEntry(
  value: SolidScriptSystemCatalogEntry,
  shown: string | null,
): SolidScriptExplorerEntry {
  return {
    name: value.name,
    category: 'System',
    value: shown ?? value.absent,
    type: value.type,
    lines: [],
    items: [],
    readOnly: true,
    detail: value.detail,
    ...(shown === null ? { placeholder: true } : {}),
  };
}

/**
 * Builds the entry of $Local or $Persistent, opening to the names it holds now,
 * by letter.
 *
 * @param value Catalog entry.
 * @param live Values of the run by shown name.
 * @returns Entry.
 */
function solidScriptExplorerScopedEntry(
  value: SolidScriptSystemCatalogEntry,
  live: ReadonlyMap<string, SolidScriptVariable>,
): SolidScriptExplorerEntry {
  const prefix = `${value.name.toLowerCase()}.`;
  const held = [...live]
    .filter(([name]) => name.toLowerCase().startsWith(prefix))
    .map(([name, variable]) => ({ ...variable, name }));
  return solidScriptExplorerMembersEntry(value, held, 'Value');
}

/**
 * Builds the entry of $Resources from the script's own resources, which a run
 * reads straight from the script rather than keeping as variables: each one
 * with the value $Resources.Name gives, by letter.
 *
 * @param value Catalog entry.
 * @param script Script, with the resources of its Resources tab.
 * @returns Entry.
 */
function solidScriptExplorerResourcesEntry(
  value: SolidScriptSystemCatalogEntry,
  script: SolidScriptDocument,
): SolidScriptExplorerEntry {
  const resources = script.resources ?? [];
  const values = new SolidScriptResourceValues(resources, (path, name) => new SolidScriptPathElement(-1, name, path));
  const held = resources.map((resource) => solidScriptExplorerResourceItem(values, resource));
  return solidScriptExplorerMembersEntry(value, held, 'Resource');
}

/**
 * Describes one resource as the script reads it, or why it cannot be read.
 *
 * @param values Resource values of the script.
 * @param resource Resource.
 * @returns Item named $Resources.Name, typed by its kind.
 */
function solidScriptExplorerResourceItem(
  values: SolidScriptResourceValues,
  resource: SolidScriptResource,
): SolidScriptVariable {
  const name = `$Resources.${resource.name}`;
  try {
    return { ...solidScriptVariableView(name, values.value(resource.name)), type: resource.kind };
  } catch (error) {
    return { name, value: solidScriptErrorText(error), type: resource.kind, items: [] };
  }
}

/**
 * Builds the entry of a name that opens to the names it holds, counted, such as
 * "2 Values", or its placeholder when it holds none.
 *
 * @param value Catalog entry.
 * @param held Names it holds.
 * @param noun What one held name is, such as Value.
 * @returns Entry.
 */
function solidScriptExplorerMembersEntry(
  value: SolidScriptSystemCatalogEntry,
  held: readonly SolidScriptVariable[],
  noun: string,
): SolidScriptExplorerEntry {
  const count = held.length;
  const shown = count === 0 ? null : `${count} ${noun}${count === 1 ? '' : 's'}`;
  return {
    ...solidScriptExplorerSystemEntry(value, shown),
    items: solidScriptExplorerVariablesSorted(held),
    members: true,
  };
}
