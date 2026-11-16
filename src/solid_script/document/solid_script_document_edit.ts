import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_COMMAND_BLANK,
  SOLID_SCRIPT_COMMAND_END,
} from '@/solid_script/commands/solid_script_commands_logic.js';
import { solidScriptBlockCreate, type SolidScriptBlock, type SolidScriptDocument } from './solid_script_document.js';

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
 * Moves lines before another line. Every line moves on its own, End and Else
 * lines too, so moving an opener out of its block leaves the rest where it was;
 * the structure check then names a missing or extra End on its line.
 *
 * @param document Script.
 * @param first First line index to move.
 * @param last Last line index to move.
 * @param to Line index to move before; the line count moves to the end.
 * @returns Edited script and the new index of the first moved line.
 */
export function solidScriptDocumentRangeMove(
  document: SolidScriptDocument,
  first: number,
  last: number,
  to: number,
): SolidScriptInsertResult {
  if (to >= first && to <= last + 1) return { document, line: first };
  const blocks = [...document.blocks];
  const moved = blocks.splice(first, last - first + 1);
  const line = to > last ? to - moved.length : to;
  blocks.splice(line, 0, ...moved);
  return { document: solidScriptDocumentWith(document, blocks), line };
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

/**
 * Removes exactly the lines of a range; an opener leaves its End behind, and an
 * End may go alone, like any other line.
 *
 * @param document Script.
 * @param first First line index.
 * @param last Last line index.
 * @returns Edited script and the line to focus.
 */
export function solidScriptDocumentRangeRemove(
  document: SolidScriptDocument,
  first: number,
  last: number,
): SolidScriptInsertResult {
  const from = Math.max(0, Math.min(first, last));
  const to = Math.max(first, last);
  const blocks = document.blocks.filter((_, line) => line < from || line > to);
  return { document: solidScriptDocumentWith(document, blocks), line: Math.max(0, Math.min(from, blocks.length - 1)) };
}

/**
 * Turns the lines of a range off, or on again when all of them are off. End and
 * Else lines follow the line that opens their block, so they are left as they
 * are.
 *
 * @param document Script.
 * @param first First line index.
 * @param last Last line index.
 * @returns Edited script, and how many lines changed and whether they are off
 *   now.
 */
export function solidScriptDocumentRangeToggle(
  document: SolidScriptDocument,
  first: number,
  last: number,
): { document: SolidScriptDocument; count: number; off: boolean } {
  const from = Math.max(0, Math.min(first, last));
  const to = Math.max(first, last);
  const togglable = (block: SolidScriptBlock, line: number): boolean => {
    const nesting = solidScriptCommandFind(block.command)?.nesting ?? 'none';
    return line >= from && line <= to && (nesting === 'none' || nesting === 'open');
  };
  const chosen = document.blocks.filter(togglable);
  const off = !chosen.every((block) => block.off === true);
  const blocks = document.blocks.map((block, line) => {
    if (!togglable(block, line)) return block;
    const { off: _was, ...rest } = block;
    return off ? { ...rest, off: true as const } : rest;
  });
  return { document: solidScriptDocumentWith(document, blocks), count: chosen.length, off };
}

/**
 * Inserts copied lines with new ids below a line, filling it when it is a blank
 * line.
 *
 * @param document Script.
 * @param index Current line.
 * @param lines Lines to insert.
 * @returns Edited script and the first inserted line.
 */
export function solidScriptDocumentLinesInsert(
  document: SolidScriptDocument,
  index: number,
  lines: readonly { command: string; values?: Readonly<Record<string, string>>; off?: boolean }[],
): SolidScriptInsertResult {
  const blocks = [...document.blocks];
  const reuse = solidScriptBlockIsBlank(blocks[index]);
  const line = blocks.length === 0 ? 0 : Math.max(0, Math.min(reuse ? index : index + 1, blocks.length));
  const inserted = lines.map((entry) => solidScriptBlockCreate(entry.command, { ...entry.values }, entry.off === true));
  blocks.splice(line, reuse ? 1 : 0, ...inserted);
  return { document: solidScriptDocumentWith(document, blocks), line };
}
