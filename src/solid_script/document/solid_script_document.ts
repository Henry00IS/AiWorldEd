import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

/** Version of the stored script format. */
export const SOLID_SCRIPT_DOCUMENT_VERSION = 1;

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
}

/** A script: its name and its lines in order. */
export interface SolidScriptDocument {
  /** Format version. */
  version: typeof SOLID_SCRIPT_DOCUMENT_VERSION;
  /** Script name, shown in the inspector and used for its file. */
  name: string;
  /** Lines in order. */
  blocks: SolidScriptBlock[];
}

/** A command line to create, by command id and the values replacing defaults. */
export interface SolidScriptLine {
  /** Command id. */
  command: string;
  /** Values replacing the command's defaults. */
  values?: Record<string, string>;
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
 * Creates a command line with the command's default values.
 *
 * @param command Command id.
 * @param values Values replacing defaults.
 * @returns Line.
 */
export function solidScriptBlockCreate(command: string, values: Record<string, string> = {}): SolidScriptBlock {
  const defaults = solidScriptCommandFind(command)?.valuesDefault() ?? {};
  return { id: solidScriptBlockId(), command, values: { ...defaults, ...values } };
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
    blocks: lines.map((line) => solidScriptBlockCreate(line.command, line.values)),
  };
}

/**
 * Returns the script a new generator starts with: a ball cut out of a cube.
 *
 * @returns Script.
 */
export function solidScriptDocumentDefault(): SolidScriptDocument {
  return solidScriptDocumentCreate(
    [
      { command: 'detail', values: { segments: '24' } },
      { command: 'translate', values: { v: '[0, 0, 1]' } },
      { command: 'difference' },
      { command: 'cube', values: { size: '[2, 2, 2]', center: 'true' } },
      { command: 'sphere', values: { r: '1.3' } },
      { command: 'end' },
      { command: 'end' },
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
  return { version: SOLID_SCRIPT_DOCUMENT_VERSION, name, blocks };
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
  return { id, command: record['command'], values: solidScriptBlockValues(record['values']) };
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
