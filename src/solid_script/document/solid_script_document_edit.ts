import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_COMMAND_END } from '@/solid_script/commands/solid_script_commands_logic.js';
import {
  solidScriptBlockCodeCreate,
  solidScriptBlockCommandCreate,
  type SolidScriptBlock,
  type SolidScriptDocument,
} from './solid_script_document.js';
import { solidScriptBlockSource } from './solid_script_document_source.js';
import { solidScriptLineBraces } from './solid_script_document_indent.js';

/**
 * Where a new command line goes relative to a line: 'caret' below the current
 * line, 'before' in front of a drop target. Either fills the line itself when
 * it is blank or only whitespace.
 */
export type SolidScriptInsertMode = 'caret' | 'before';

/** A script after an insert, with the line of the inserted command. */
export interface SolidScriptInsertResult {
  /** Edited script. */
  document: SolidScriptDocument;
  /** Line index of the new command line. */
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
 * Returns whether a line is a code line holding only whitespace.
 *
 * @param block Line, or undefined.
 * @returns True for a blank code line.
 */
function solidScriptBlockIsBlank(block: SolidScriptBlock | undefined): boolean {
  return block?.type === 'code' && block.code.trim() === '';
}

/**
 * Inserts a command line, followed by an End line when the command opens a
 * block.
 *
 * @param document Script.
 * @param command Command id.
 * @param index Current line or drop target.
 * @param mode Below the current line, or before the drop target.
 * @returns Edited script and the command's line.
 */
export function solidScriptDocumentCommandInsert(
  document: SolidScriptDocument,
  command: string,
  index: number,
  mode: SolidScriptInsertMode,
): SolidScriptInsertResult {
  const blocks = [...document.blocks];
  const reuse = solidScriptBlockIsBlank(blocks[index]);
  const at = reuse || mode === 'before' || blocks.length === 0 ? index : index + 1;
  const line = Math.max(0, Math.min(at, blocks.length));
  const inserted = [solidScriptBlockCommandCreate(command)];
  if (solidScriptCommandFind(command)?.opensBlock)
    inserted.push(solidScriptBlockCommandCreate(SOLID_SCRIPT_COMMAND_END));
  blocks.splice(line, reuse ? 1 : 0, ...inserted);
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
  const first = document.blocks[index];
  if (!first || solidScriptLineBraces(solidScriptBlockSource(first)).balance <= 0) return [index, index];
  let open = 0;
  for (let line = index; line < document.blocks.length; line++) {
    const block = document.blocks[line];
    open += block ? solidScriptLineBraces(solidScriptBlockSource(block)).balance : 0;
    if (open <= 0) return [index, line];
  }
  return [index, document.blocks.length - 1];
}

/**
 * Removes a line; a block opener takes its closing line along and leaves the
 * lines inside.
 *
 * @param document Script.
 * @param index Line index.
 * @returns Edited script.
 */
export function solidScriptDocumentLineRemove(document: SolidScriptDocument, index: number): SolidScriptDocument {
  const [first, last] = solidScriptDocumentBlockRange(document, index);
  const closing = document.blocks[last];
  const closes =
    last > first && closing !== undefined && solidScriptLineBraces(solidScriptBlockSource(closing)).leadingClose;
  return solidScriptDocumentWith(
    document,
    document.blocks.filter((_, line) => line !== first && !(closes && line === last)),
  );
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
 * Splits a code line at a caret position into two code lines.
 *
 * @param document Script.
 * @param index Line index.
 * @param caret Character index.
 * @returns Edited script.
 */
export function solidScriptDocumentLineSplit(
  document: SolidScriptDocument,
  index: number,
  caret: number,
): SolidScriptDocument {
  const block = document.blocks[index];
  const text = block?.type === 'code' ? block.code : '';
  const blocks = [...document.blocks];
  const head = block?.type === 'code' ? [{ ...block, code: text.slice(0, caret) }] : block ? [block] : [];
  blocks.splice(
    index,
    head.length,
    ...head,
    solidScriptBlockCodeCreate(block?.type === 'code' ? text.slice(caret) : ''),
  );
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
