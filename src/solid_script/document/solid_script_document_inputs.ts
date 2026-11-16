import {
  SOLID_SCRIPT_COMMAND_INPUT,
  SOLID_SCRIPT_COMMAND_INPUT_GROUP,
  SOLID_SCRIPT_COMMAND_INPUT_NOTE,
  solidScriptInputRead,
  type SolidScriptInput,
} from '@/solid_script/language/solid_script_input.js';
import type { SolidScriptDocument } from './solid_script_document.js';
import { solidScriptBlockNesting } from './solid_script_document_indent.js';

/** One row of a script's inspector: an input or a note, with its group title. */
export type SolidScriptInputLayoutItem =
  { kind: 'input'; input: SolidScriptInput; group: string } | { kind: 'note'; text: string; group: string };

/**
 * Lists the inspector rows of a script in line order, read without running it:
 * one per Input line, one per Input Note, each with the title of the innermost
 * Input Group around it, or empty outside any. Inputs whose fields cannot be
 * read are left out; they show their error when the script runs.
 *
 * @param document Script.
 * @returns Rows.
 */
export function solidScriptDocumentInputLayout(document: SolidScriptDocument): SolidScriptInputLayoutItem[] {
  const items: SolidScriptInputLayoutItem[] = [];
  const names = new Set<string>();
  // Title of each open block: a group's title, or null for other blocks and
  // untitled groups.
  const open: (string | null)[] = [];
  for (const block of document.blocks) {
    const group = [...open].reverse().find((title) => title !== null) ?? '';
    const nesting = solidScriptBlockNesting(block);
    if (block.command === SOLID_SCRIPT_COMMAND_INPUT_NOTE) {
      const text = (block.values['text'] ?? '').trim();
      if (text !== '') items.push({ kind: 'note', text, group });
    } else if (block.command === SOLID_SCRIPT_COMMAND_INPUT) {
      try {
        const input = solidScriptInputRead(block.values);
        if (input.name !== '' && !names.has(input.name)) {
          names.add(input.name);
          items.push({ kind: 'input', input, group });
        }
      } catch {
        // Its error shows when the script runs.
      }
    }
    if (nesting === 'open')
      open.push(
        block.command === SOLID_SCRIPT_COMMAND_INPUT_GROUP ? (block.values['title'] ?? '').trim() || null : null,
      );
    if (nesting === 'close') open.pop();
  }
  return items;
}
