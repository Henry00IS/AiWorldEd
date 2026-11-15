import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

/** Version of the stored script format. */
export const SOLID_SCRIPT_DOCUMENT_VERSION = 1;

/** A line typed as code. */
export interface SolidScriptBlockCode {
  /** Stable line id. */
  id: string;
  type: 'code';
  /** One line of code. */
  code: string;
}

/** A command line, edited through its configurator. */
export interface SolidScriptBlockCommand {
  /** Stable line id. */
  id: string;
  type: 'command';
  /** Command id. */
  command: string;
  /** Code text per parameter key. */
  values: Record<string, string>;
}

/** One line of a script. */
export type SolidScriptBlock = SolidScriptBlockCode | SolidScriptBlockCommand;

/** A script: its lines in order. */
export interface SolidScriptDocument {
  /** Format version. */
  version: typeof SOLID_SCRIPT_DOCUMENT_VERSION;
  /** Lines in order. */
  blocks: SolidScriptBlock[];
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
 * @returns Block.
 */
export function solidScriptBlockCommandCreate(
  command: string,
  values: Record<string, string> = {},
): SolidScriptBlockCommand {
  const defaults = solidScriptCommandFind(command)?.valuesDefault() ?? {};
  return { id: solidScriptBlockId(), type: 'command', command, values: { ...defaults, ...values } };
}

/**
 * Creates a code line.
 *
 * @param code Code text; line breaks become spaces.
 * @returns Block.
 */
export function solidScriptBlockCodeCreate(code: string): SolidScriptBlockCode {
  return { id: solidScriptBlockId(), type: 'code', code: code.replace(/[\r\n]+/g, ' ') };
}

/**
 * Returns the script a new generator starts with: a ball cut out of a cube.
 *
 * @returns Script.
 */
export function solidScriptDocumentDefault(): SolidScriptDocument {
  return {
    version: SOLID_SCRIPT_DOCUMENT_VERSION,
    blocks: [
      solidScriptBlockCommandCreate('detail', { segments: '24' }),
      solidScriptBlockCommandCreate('translate', { v: '[0, 0, 1]' }),
      solidScriptBlockCommandCreate('difference'),
      solidScriptBlockCommandCreate('cube', { size: '[2, 2, 2]', center: 'true' }),
      solidScriptBlockCommandCreate('sphere', { r: '1.3' }),
      solidScriptBlockCommandCreate('end'),
      solidScriptBlockCommandCreate('end'),
    ],
  };
}

/**
 * Reads a stored script, keeping every well-formed line, unknown commands
 * included, and giving lines without a unique id a new one.
 *
 * @param input Stored value.
 * @returns Script; empty when the input is no script.
 */
export function solidScriptDocumentNormalize(input: unknown): SolidScriptDocument {
  const raw = typeof input === 'object' && input !== null ? (input as { blocks?: unknown }).blocks : undefined;
  const ids = new Set<string>();
  const blocks = (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const block = solidScriptBlockNormalize(entry);
    if (!block) return [];
    if (ids.has(block.id)) block.id = solidScriptBlockId();
    ids.add(block.id);
    return [block];
  });
  return { version: SOLID_SCRIPT_DOCUMENT_VERSION, blocks };
}

/**
 * Reads one stored line.
 *
 * @param entry Stored value.
 * @returns Block, or null when the entry is no line.
 */
function solidScriptBlockNormalize(entry: unknown): SolidScriptBlock | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const id = typeof record['id'] === 'string' && record['id'] ? record['id'] : solidScriptBlockId();
  if (record['type'] === 'code')
    return { ...solidScriptBlockCodeCreate(typeof record['code'] === 'string' ? record['code'] : ''), id };
  if (record['type'] !== 'command' || typeof record['command'] !== 'string') return null;
  return { id, type: 'command', command: record['command'], values: solidScriptBlockValues(record['values']) };
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
