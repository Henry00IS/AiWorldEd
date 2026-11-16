import {
  SOLID_SCRIPT_COMMAND_INPUT,
  SOLID_SCRIPT_COMMAND_INPUT_GROUP,
  SOLID_SCRIPT_COMMAND_INPUT_NOTE,
  SOLID_SCRIPT_COMMAND_INPUT_ROW,
  SOLID_SCRIPT_COMMAND_SHOW_INPUTS_WHEN,
  solidScriptInputRead,
  type SolidScriptInput,
} from '@/solid_script/language/solid_script_input.js';
import type { SolidScriptDocument } from './solid_script_document.js';
import { solidScriptBlockNesting } from './solid_script_document_indent.js';

/** A Show Inputs When condition: the input's value as typed must match. */
export interface SolidScriptInputRule {
  /** Input name. */
  name: string;
  /** Value it must have. */
  value: string;
}

/** Where a row of a script's inspector sits. */
interface SolidScriptInputPlace {
  /** Title of the innermost Input Group around it, or empty. */
  group: string;
  /** Line of the Input Row it shares, or null. */
  row: number | null;
  /** Conditions of the Show Inputs When blocks around it; all must hold. */
  when: readonly SolidScriptInputRule[];
}

/** One row of a script's inspector: an input or a note, and where it sits. */
export type SolidScriptInputLayoutItem =
  | ({ kind: 'input'; input: SolidScriptInput } & SolidScriptInputPlace)
  | ({ kind: 'note'; text: string } & SolidScriptInputPlace);

/** What an open block means for the rows inside it. */
type SolidScriptInputOpen =
  { kind: 'group'; title: string } | { kind: 'row'; line: number } | ({ kind: 'when' } & SolidScriptInputRule) | null;

/**
 * Lists the inspector rows of a script in line order, read without running it:
 * one per Input line and one per Input Note, each with the Input Group, Input
 * Row and Show Inputs When blocks around it. Inputs whose fields cannot be read
 * are left out; they show their error when the script runs.
 *
 * @param document Script.
 * @returns Rows.
 */
export function solidScriptDocumentInputLayout(document: SolidScriptDocument): SolidScriptInputLayoutItem[] {
  const items: SolidScriptInputLayoutItem[] = [];
  const names = new Set<string>();
  const open: SolidScriptInputOpen[] = [];
  document.blocks.forEach((block, line) => {
    const nesting = solidScriptBlockNesting(block);
    if (block.command === SOLID_SCRIPT_COMMAND_INPUT_NOTE) {
      const text = (block.values['text'] ?? '').trim();
      if (text !== '') items.push({ kind: 'note', text, ...solidScriptInputPlace(open) });
    } else if (block.command === SOLID_SCRIPT_COMMAND_INPUT) {
      try {
        const input = solidScriptInputRead(block.values);
        if (input.name !== '' && !names.has(input.name)) {
          names.add(input.name);
          items.push({ kind: 'input', input, ...solidScriptInputPlace(open) });
        }
      } catch {
        // Its error shows when the script runs.
      }
    }
    if (nesting === 'open') open.push(solidScriptInputOpenOf(block.command, block.values, line));
    if (nesting === 'close') open.pop();
  });
  return items;
}

/**
 * Reads what an opening line means for the inspector rows inside it.
 *
 * @param command Command id.
 * @param values Field text by key.
 * @param line Line number.
 * @returns Meaning, or null for blocks that do not shape the inspector.
 */
function solidScriptInputOpenOf(
  command: string,
  values: Readonly<Record<string, string | undefined>>,
  line: number,
): SolidScriptInputOpen {
  if (command === SOLID_SCRIPT_COMMAND_INPUT_GROUP) {
    const title = (values['title'] ?? '').trim();
    return title === '' ? null : { kind: 'group', title };
  }
  if (command === SOLID_SCRIPT_COMMAND_INPUT_ROW) return { kind: 'row', line };
  if (command === SOLID_SCRIPT_COMMAND_SHOW_INPUTS_WHEN)
    return { kind: 'when', name: (values['name'] ?? '').trim(), value: (values['value'] ?? 'yes').trim() };
  return null;
}

/**
 * Reads where a row sits from the blocks open around it.
 *
 * @param open Open blocks, outermost first.
 * @returns Place.
 */
function solidScriptInputPlace(open: readonly SolidScriptInputOpen[]): SolidScriptInputPlace {
  let group = '';
  let row: number | null = null;
  const when: SolidScriptInputRule[] = [];
  for (const entry of open) {
    if (entry?.kind === 'group') group = entry.title;
    if (entry?.kind === 'row') row = entry.line;
    if (entry?.kind === 'when') when.push({ name: entry.name, value: entry.value });
  }
  return { group, row, when };
}

/**
 * Tells whether the rows under some Show Inputs When conditions are shown:
 * every named input must have the value, where Yes, True and 1 match each
 * other, as do No, False and 0, and case does not matter.
 *
 * @param when Conditions.
 * @param valueOf Current text of an input by name.
 * @returns True when every condition holds.
 */
export function solidScriptInputRulesHold(
  when: readonly SolidScriptInputRule[],
  valueOf: (name: string) => string | undefined,
): boolean {
  const plain = (text: string): string => {
    const lower = text.trim().toLowerCase();
    if (['yes', 'true', '1'].includes(lower)) return 'yes';
    if (['no', 'false', '0'].includes(lower)) return 'no';
    return lower;
  };
  return when.every((rule) => plain(valueOf(rule.name) ?? '') === plain(rule.value));
}
