import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_COMMAND_BLANK,
  SOLID_SCRIPT_COMMAND_END,
} from '@/solid_script/commands/solid_script_commands_logic.js';
import { solidScriptBlockCreate, type SolidScriptBlock, type SolidScriptDocument } from './solid_script_document.js';
import { solidScriptBlockNesting } from './solid_script_document_indent.js';

/**
 * Where a new command line goes relative to a line: 'caret' below the current
 * line, 'before' in front of a drop target. Either fills the line itself when
 * it is a blank line.
 */
export type SolidScriptInsertMode = 'caret' | 'before';

/** A script after an insert, with the line of the inserted line. */
export interface SolidScriptInsertResult {
  /** Edited script. */
  document: SolidScriptDocument;
  /** Line index of the new line. */
  line: number;
}

/**
 * Returns a copy of a script with new lines.
 *
 * @param document Script.
 * @param blocks Lines.
 * @returns Script.
 */
function solidScriptDocumentWith(document: SolidScriptDocument, blocks: SolidScriptBlock[]): SolidScriptDocument {
  return { ...document, blocks };
}

/**
 * Returns whether a line is a blank line.
 *
 * @param block Line, or undefined.
 * @returns True for a Blank Line command.
 */
export function solidScriptBlockIsBlank(block: SolidScriptBlock | undefined): boolean {
  return block?.command === SOLID_SCRIPT_COMMAND_BLANK;
}

/**
 * Inserts a command line, followed by an End line when the command opens a
 * block.
 *
 * @param document Script.
 * @param command Command id.
 * @param index Current line or drop target.
 * @param mode Below the current line, or before the drop target.
 * @param values Configured values, or the command's defaults when omitted.
 * @returns Edited script and the command's line.
 */
export function solidScriptDocumentCommandInsert(
  document: SolidScriptDocument,
  command: string,
  index: number,
  mode: SolidScriptInsertMode,
  values?: Record<string, string>,
): SolidScriptInsertResult {
  const blocks = [...document.blocks];
  const reuse = solidScriptBlockIsBlank(blocks[index]);
  const at = reuse || mode === 'before' || blocks.length === 0 ? index : index + 1;
  const line = Math.max(0, Math.min(at, blocks.length));
  const inserted = [solidScriptBlockCreate(command, values)];
  const found = solidScriptCommandFind(command);
  if (found?.nesting === 'open') {
    for (const line of found.starter) inserted.push(solidScriptBlockCreate(line.command, { ...line.values }));
    inserted.push(solidScriptBlockCreate(SOLID_SCRIPT_COMMAND_END));
  }
  blocks.splice(line, reuse ? 1 : 0, ...inserted);
  return { document: solidScriptDocumentWith(document, blocks), line };
}

/**
 * Inserts a blank line below a line, or as the only line of an empty script.
 *
 * @param document Script.
 * @param index Current line.
 * @returns Edited script and the blank line.
 */
export function solidScriptDocumentBlankInsert(document: SolidScriptDocument, index: number): SolidScriptInsertResult {
  const blocks = [...document.blocks];
  const line = blocks.length === 0 ? 0 : Math.max(0, Math.min(index + 1, blocks.length));
  blocks.splice(line, 0, solidScriptBlockCreate(SOLID_SCRIPT_COMMAND_BLANK));
  return { document: solidScriptDocumentWith(document, blocks), line };
}

/**
 * Returns the lines a line spans: a block opener with everything up to its
 * closing line, any other line alone.
 *
 * @param document Script.
 * @param index Line index.
 * @returns First and last line index.
 */
export function solidScriptDocumentBlockRange(document: SolidScriptDocument, index: number): [number, number] {
  if (solidScriptBlockNesting(document.blocks[index]) !== 'open') return [index, index];
  let open = 0;
  for (let line = index; line < document.blocks.length; line++) {
    const nesting = solidScriptBlockNesting(document.blocks[line]);
    if (nesting === 'open') open += 1;
    if (nesting === 'close') open -= 1;
    if (open <= 0) return [index, line];
  }
  return [index, document.blocks.length - 1];
}

/**
 * Removes a line; a block opener takes its own Else and End lines along and
 * leaves the lines inside.
 *
 * @param document Script.
 * @param index Line index.
 * @returns Edited script.
 */
export function solidScriptDocumentLineRemove(document: SolidScriptDocument, index: number): SolidScriptDocument {
  const removed = solidScriptDocumentBlockFrame(document, index);
  return solidScriptDocumentWith(
    document,
    document.blocks.filter((_, line) => !removed.has(line)),
  );
}

/**
 * Returns the lines that frame a block: its opener and the Else and End lines
 * at the opener's own level; any other line alone.
 *
 * @param document Script.
 * @param index Line index.
 * @returns Line indices.
 */
function solidScriptDocumentBlockFrame(document: SolidScriptDocument, index: number): Set<number> {
  const [first, last] = solidScriptDocumentBlockRange(document, index);
  const frame = new Set([first]);
  let open = 0;
  for (let line = first; line <= last && last > first; line++) {
    const nesting = solidScriptBlockNesting(document.blocks[line]);
    if (nesting === 'close') open -= 1;
    if ((nesting === 'close' && open === 0) || (nesting === 'continue' && open === 1)) frame.add(line);
    if (nesting === 'open') open += 1;
  }
  return frame;
}

/**
 * Moves a line, or a block opener with its whole block, before another line.
 *
 * @param document Script.
 * @param from Line index to move.
 * @param to Line index to move before; the line count moves to the end.
 * @returns Edited script.
 */
export function solidScriptDocumentMove(document: SolidScriptDocument, from: number, to: number): SolidScriptDocument {
  const [first, last] = solidScriptDocumentBlockRange(document, from);
  if (to >= first && to <= last + 1) return document;
  const blocks = [...document.blocks];
  const moved = blocks.splice(first, last - first + 1);
  blocks.splice(to > last ? to - moved.length : to, 0, ...moved);
  return solidScriptDocumentWith(document, blocks);
}

/**
 * Replaces one line.
 *
 * @param document Script.
 * @param index Line index.
 * @param block New line.
 * @returns Edited script.
 */
export function solidScriptDocumentLineSet(
  document: SolidScriptDocument,
  index: number,
  block: SolidScriptBlock,
): SolidScriptDocument {
  return solidScriptDocumentWith(
    document,
    document.blocks.map((current, line) => (line === index ? block : current)),
  );
}
