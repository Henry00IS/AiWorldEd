import {
  solidScriptDocumentResourcesWith,
  solidScriptResourcesNormalize,
  type SolidScriptResource,
} from './solid_script_resource.js';
import { solidScriptDocumentJsonMigrate } from './solid_script_document_json_migrate.js';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';

import { SOLID_SCRIPT_WIDGET_COMMAND_PREFIX } from '@/solid_script/language/solid_script_widget.js';

/** Version of the stored script format, shown as Solid Script 1 in Settings. */
export const SOLID_SCRIPT_DOCUMENT_VERSION = 1;

/** User-facing name of each stored script version. */
export const SOLID_SCRIPT_VERSION_LABEL: Record<typeof SOLID_SCRIPT_DOCUMENT_VERSION, string> = {
  1: 'Solid Script 1',
};

/** Name of a script that has none yet. */
export const SOLID_SCRIPT_DOCUMENT_NAME_DEFAULT = 'Script';

/**
 * One line of a script: a command with its configured values. Scripts consist
 * of command lines only; a blank line is the Blank Line command.
 */
export interface SolidScriptBlock {
  /** Stable line id. */
  id: string;
  /** Command id. */
  command: string;
  /** Code text per parameter key. */
  values: Record<string, string>;
  /** True for a line turned off: it stays in the script but does not run. */
  off?: true;
}

/** How a script may be used: as a generator, as a modifier, or both. */
export interface SolidScriptUses {
  /** Builds new geometry from nothing in a generator node. */
  generator: boolean;
  /** Works on the brush, mesh or group it is added to, in a modifier stack. */
  modifier: boolean;
}

/** One way a script may be used. */
export type SolidScriptUse = keyof SolidScriptUses;

/** Uses of a script that sets none: a generator only. */
export const SOLID_SCRIPT_USES_DEFAULT: Readonly<SolidScriptUses> = { generator: true, modifier: false };

/** A script: its name and its lines in order. */
export interface SolidScriptDocument {
  /** Stored script version, shown as Solid Script 1 in Settings. */
  version: typeof SOLID_SCRIPT_DOCUMENT_VERSION;
  /** Script name, shown in the inspector and used for its file. */
  name: string;
  /** Lines in order. */
  blocks: SolidScriptBlock[];
  /** Can Be Used As; absent means a generator only. */
  uses?: SolidScriptUses;
  /** Who wrote it, shown in the editor's Settings; absent when not given. */
  author?: string;
  /**
   * True when the Edit button offers its widgets in the scene; absent means no
   * edit mode.
   */
  editMode?: true;
  /**
   * Textures, curves, paths and texts kept with the script, read as
   * $Resources.Name.
   */
  resources?: SolidScriptResource[];
}

/** A command line to create, by command id and the values replacing defaults. */
export interface SolidScriptLine {
  /** Command id. */
  command: string;
  /** Values replacing the command's defaults. */
  values?: Record<string, string>;
  /** True for a line turned off. */
  off?: boolean;
}

/**
 * Returns a new random line id.
 *
 * @returns Eight hexadecimal digits.
 */
export function solidScriptBlockId(): string {
  return Math.floor(Math.random() * 0x100000000)
    .toString(16)
    .padStart(8, '0');
}

/**
 * Creates a command line with the command's starting values, empty where a
 * declared default can show as placeholder text.
 *
 * @param command Command id.
 * @param values Values replacing the starting values.
 * @param off True makes a line that is turned off.
 * @param catalog Commands the line's command is found in.
 * @returns Line.
 */
export function solidScriptBlockCreate(
  command: string,
  values: Record<string, string> = {},
  off = false,
  catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
): SolidScriptBlock {
  const defaults = catalog.find(command)?.valuesDefault() ?? {};
  const block: SolidScriptBlock = { id: solidScriptBlockId(), command, values: { ...defaults, ...values } };
  if (off) block.off = true;
  return block;
}

/**
 * Creates a script from command lines.
 *
 * @param lines Lines in order.
 * @param name Script name.
 * @returns Script.
 */
export function solidScriptDocumentCreate(lines: readonly SolidScriptLine[], name = ''): SolidScriptDocument {
  return {
    version: SOLID_SCRIPT_DOCUMENT_VERSION,
    name,
    blocks: lines.map((line) => solidScriptBlockCreate(line.command, line.values, line.off === true)),
  };
}

/**
 * Reads a stored script version. A missing or unknown value is version 1.
 *
 * @param input Stored value.
 * @returns Version.
 */
export function solidScriptDocumentVersionRead(input: unknown): typeof SOLID_SCRIPT_DOCUMENT_VERSION {
  return input === 1 ? 1 : SOLID_SCRIPT_DOCUMENT_VERSION;
}

/**
 * Returns a copy of a script with another version.
 *
 * @param document Script.
 * @param version Version to store.
 * @returns Script.
 */
export function solidScriptDocumentVersionWith(
  document: SolidScriptDocument,
  version: typeof SOLID_SCRIPT_DOCUMENT_VERSION,
): SolidScriptDocument {
  return { ...document, version };
}

/**
 * Returns the script a new generator starts with: a ball cut out of a cube,
 * both centered in the generator.
 *
 * @returns Script.
 */
export function solidScriptDocumentDefault(): SolidScriptDocument {
  return solidScriptDocumentCreate(
    [
      { command: 'cube', values: { size: '2, 2, 2' } },
      { command: 'sphere', values: { r: '1.3', mode: 'Subtractive' } },
    ],
    SOLID_SCRIPT_DOCUMENT_NAME_DEFAULT,
  );
}

/**
 * Reads a stored script, keeping every command line, unknown commands included,
 * and giving lines without a unique id a new one.
 *
 * @param input Stored value.
 * @returns Script; empty when the input is no script.
 */
export function solidScriptDocumentNormalize(input: unknown): SolidScriptDocument {
  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const raw = record['blocks'];
  const ids = new Set<string>();
  const blocks = (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const block = solidScriptBlockNormalize(entry);
    if (!block) return [];
    if (ids.has(block.id)) block.id = solidScriptBlockId();
    ids.add(block.id);
    return [block];
  });
  const name = typeof record['name'] === 'string' ? record['name'] : '';
  const document: SolidScriptDocument = { version: solidScriptDocumentVersionRead(record['version']), name, blocks };
  const author = typeof record['author'] === 'string' ? record['author'] : '';
  const used = solidScriptDocumentUsesWith(document, solidScriptUsesNormalize(record['uses']));
  const edited = solidScriptDocumentEditModeWith(
    solidScriptDocumentAuthorWith(used, author),
    record['editMode'] === true,
  );
  return solidScriptDocumentJsonMigrate(
    solidScriptDocumentResourcesWith(edited, solidScriptResourcesNormalize(record['resources'])),
  );
}

/**
 * Turns Has Edit Mode on or off; off is left out, so older scripts stay as they
 * were.
 *
 * @param document Script.
 * @param on True when the script has an edit mode.
 * @returns Script.
 */
export function solidScriptDocumentEditModeWith(document: SolidScriptDocument, on: boolean): SolidScriptDocument {
  const { editMode: _old, ...rest } = document;
  return on ? { ...rest, editMode: true } : rest;
}

/**
 * Turns Has Edit Mode on for a script that starts fresh, such as an example,
 * when it has lines edited in the scene: Widget lines or Path inputs.
 *
 * @param document Script.
 * @returns Script.
 */
export function solidScriptDocumentEditModeFresh(document: SolidScriptDocument): SolidScriptDocument {
  return solidScriptDocumentSceneEditedCount(document) > 0 ? solidScriptDocumentEditModeWith(document, true) : document;
}

/**
 * Counts the lines of a script that run and are edited in the scene: Widget
 * lines and Path inputs.
 *
 * @param document Script.
 * @returns Count.
 */
function solidScriptDocumentSceneEditedCount(document: SolidScriptDocument): number {
  return document.blocks.filter((block) => !block.off && solidScriptDocumentEditedInScene(block)).length;
}

/**
 * Returns whether a line is edited in the scene: a Widget line or a Path input.
 *
 * @param block Line.
 * @returns True for such a line.
 */
function solidScriptDocumentEditedInScene(block: SolidScriptDocument['blocks'][number]): boolean {
  if (block.command.startsWith(SOLID_SCRIPT_WIDGET_COMMAND_PREFIX)) return true;
  return block.command === 'input' && String(block.values?.['type'] ?? '').trim() === 'Path';
}

/**
 * Turns Has Edit Mode on when an edit gives a script a Widget line or a Path
 * input it did not run before, so they can be reached in the scene; turning it
 * off again sticks until the next such line.
 *
 * @param before Script before the edit.
 * @param after Script the edit stores.
 * @returns Script to store.
 */
export function solidScriptDocumentEditModeAfter(
  before: SolidScriptDocument,
  after: SolidScriptDocument,
): SolidScriptDocument {
  if (after.editMode || solidScriptDocumentSceneEditedCount(after) <= solidScriptDocumentSceneEditedCount(before))
    return after;
  return solidScriptDocumentEditModeWith(after, true);
}

/**
 * Sets who wrote a script; an empty author is left out.
 *
 * @param document Script.
 * @param author Author, such as a name.
 * @returns Script.
 */
export function solidScriptDocumentAuthorWith(document: SolidScriptDocument, author: string): SolidScriptDocument {
  const { author: _old, ...rest } = document;
  const text = author.trim();
  return text === '' ? rest : { ...rest, author: text };
}

/**
 * Reads stored uses. A script needs at least one, so none at all reads as a
 * generator.
 *
 * @param input Stored value.
 * @returns Uses.
 */
function solidScriptUsesNormalize(input: unknown): SolidScriptUses {
  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const generator =
    typeof record['generator'] === 'boolean' ? record['generator'] : SOLID_SCRIPT_USES_DEFAULT.generator;
  const modifier = typeof record['modifier'] === 'boolean' ? record['modifier'] : SOLID_SCRIPT_USES_DEFAULT.modifier;
  return generator || modifier ? { generator, modifier } : { ...SOLID_SCRIPT_USES_DEFAULT };
}

/**
 * Returns how a script may be used.
 *
 * @param document Script.
 * @returns Uses.
 */
export function solidScriptDocumentUses(document: SolidScriptDocument): SolidScriptUses {
  return document.uses ?? { ...SOLID_SCRIPT_USES_DEFAULT };
}

/**
 * Returns a copy of a script with other uses. The default uses are not stored,
 * so older scripts and files stay as they were.
 *
 * @param document Script.
 * @param uses Uses; at least one should be on.
 * @returns Script.
 */
export function solidScriptDocumentUsesWith(document: SolidScriptDocument, uses: SolidScriptUses): SolidScriptDocument {
  const { uses: _old, ...rest } = document;
  const fallback =
    uses.generator === SOLID_SCRIPT_USES_DEFAULT.generator && uses.modifier === SOLID_SCRIPT_USES_DEFAULT.modifier;
  return fallback ? rest : { ...rest, uses: { generator: uses.generator, modifier: uses.modifier } };
}

/**
 * Says why a script may not be used in a place, in words for the user.
 *
 * @param document Script.
 * @param use Where it would be used.
 * @returns Reason, or empty when it may.
 */
export function solidScriptDocumentUseProblem(document: SolidScriptDocument, use: SolidScriptUse): string {
  if (solidScriptDocumentUses(document)[use]) return '';
  const name = document.name || 'This script';
  return use === 'modifier'
    ? `${name} is made to be used as a generator only. Turn on Modifier under Can Be Used As to use it on an object or group.`
    : `${name} is made to be used as a modifier only. Turn on Generator under Can Be Used As to use it as a generator.`;
}

/**
 * Reads one stored line.
 *
 * @param entry Stored value.
 * @returns Line, or null when the entry is no command line.
 */
function solidScriptBlockNormalize(entry: unknown): SolidScriptBlock | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;
  if (typeof record['command'] !== 'string' || !record['command']) return null;
  const id = typeof record['id'] === 'string' && record['id'] ? record['id'] : solidScriptBlockId();
  const block: SolidScriptBlock = { id, command: record['command'], values: solidScriptBlockValues(record['values']) };
  if (record['off'] === true) block.off = true;
  return block;
}

/**
 * Reads the stored values of a command line, keeping text values only.
 *
 * @param input Stored value.
 * @returns Values.
 */
function solidScriptBlockValues(input: unknown): Record<string, string> {
  if (typeof input !== 'object' || input === null) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
