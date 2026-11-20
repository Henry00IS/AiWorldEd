import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
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
 * Inserts a command line, followed by the lines its block needs, such as Then
 * and Else of a formula If, and an End line when the command opens a block.
 *
 * @param document Script.
 * @param command Command id.
 * @param index Current line or drop target.
 * @param mode Below the current line, or before the drop target.
 * @param values Configured values, or the command's defaults when omitted.
 * @param catalog Commands the command is found in.
 * @returns Edited script and the command's line.
 */
export function solidScriptDocumentCommandInsert(
  document: SolidScriptDocument,
  command: string,
  index: number,
  mode: SolidScriptInsertMode,
  values?: Record<string, string>,
  catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
): SolidScriptInsertResult {
  const blocks = [...document.blocks];
  const reuse = solidScriptBlockIsBlank(blocks[index]);
  const at = reuse || mode === 'before' || blocks.length === 0 ? index : index + 1;
  const line = Math.max(0, Math.min(at, blocks.length));
  const found = catalog.find(command);
  const inserted = [solidScriptBlockCreate(command, values, false, catalog)];
  for (const part of found?.parts ?? []) inserted.push(solidScriptBlockCreate(part, undefined, false, catalog));
  if (found?.nesting === 'open') inserted.push(solidScriptBlockCreate(SOLID_SCRIPT_COMMAND_END));
  blocks.splice(line, reuse ? 1 : 0, ...inserted);
  return { document: solidScriptDocumentWith(document, blocks), line };
}

/**
 * Wraps selected lines in a block command: the command goes above the first
 * line and its End below the last, so the lines move one level in. Only lines
 * whose blocks are whole are wrapped: every block opened in them ends in them,
 * and no End or Else in them belongs to a block outside.
 *
 * @param document Script.
 * @param command Command id of a block command.
 * @param first First selected line.
 * @param last Last selected line, after the first.
 * @param values Configured values, or the command's defaults when omitted.
 * @param catalog Commands the command and the lines are found in.
 * @returns Edited script and the command's line, or null when the command opens
 *   no block or the lines cannot be wrapped.
 */
export function solidScriptDocumentCommandWrap(
  document: SolidScriptDocument,
  command: string,
  first: number,
  last: number,
  values?: Record<string, string>,
  catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
): SolidScriptInsertResult | null {
  if (catalog.find(command)?.nesting !== 'open' || first < 0 || last <= first) return null;
  const selected = document.blocks.slice(first, last + 1);
  if (selected.length !== last - first + 1) return null;
  let depth = 0;
  for (const block of selected) {
    const nesting = solidScriptBlockNesting(block, catalog);
    if ((nesting === 'close' || nesting === 'continue') && depth === 0) return null;
    if (nesting === 'open') depth += 1;
    if (nesting === 'close') depth -= 1;
  }
  if (depth !== 0) return null;
  const blocks = [...document.blocks];
  blocks.splice(last + 1, 0, solidScriptBlockCreate(SOLID_SCRIPT_COMMAND_END));
  blocks.splice(first, 0, solidScriptBlockCreate(command, values, false, catalog));
  return { document: solidScriptDocumentWith(document, blocks), line: first };
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
 * Moves lines before another line, squashed together in their order. Every line
 * moves on its own, End and Else lines too, so moving an opener out of its
 * block leaves the rest where it was; the structure check then names a missing
 * or extra End on its line.
 *
 * @param document Script.
 * @param lines Line indexes to move, in any order.
 * @param to Line index to move before; the line count moves to the end.
 * @returns Edited script and the new index of the first moved line.
 */
export function solidScriptDocumentLinesMove(
  document: SolidScriptDocument,
  lines: readonly number[],
  to: number,
): SolidScriptInsertResult {
  const chosen = new Set(lines);
  const moved = document.blocks.filter((_, line) => chosen.has(line));
  const rest = document.blocks.filter((_, line) => !chosen.has(line));
  const line = to - lines.filter((index) => index < to).length;
  const blocks = [...rest.slice(0, line), ...moved, ...rest.slice(line)];
  if (blocks.every((block, index) => block === document.blocks[index])) return { document, line: Math.min(...lines) };
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
 * Removes exactly the given lines; an opener leaves its End behind, and an End
 * may go alone, like any other line.
 *
 * @param document Script.
 * @param lines Line indexes to remove.
 * @returns Edited script and the line to focus.
 */
export function solidScriptDocumentLinesRemove(
  document: SolidScriptDocument,
  lines: readonly number[],
): SolidScriptInsertResult {
  const chosen = new Set(lines);
  const blocks = document.blocks.filter((_, line) => !chosen.has(line));
  const from = Math.max(0, Math.min(...lines));
  return { document: solidScriptDocumentWith(document, blocks), line: Math.max(0, Math.min(from, blocks.length - 1)) };
}

/**
 * Finds the End and Else lines of the block a line opens, among the lines that
 * are on (to turn them off with it) or among the off lines on its level (to
 * turn them on again). Lines that are off do not count for the structure.
 *
 * @param document Script.
 * @param off Off state of every line now.
 * @param opener Index of the block line.
 * @param on True looks for off End and Else lines to turn on.
 * @param catalog Commands the lines are found in.
 * @returns Line indexes of its Else and End lines.
 */
function solidScriptDocumentBlockPartners(
  document: SolidScriptDocument,
  off: readonly boolean[],
  opener: number,
  on: boolean,
  catalog: SolidScriptCommandCatalog,
): number[] {
  const partners: number[] = [];
  let depth = 0;
  for (let line = opener + 1; line < document.blocks.length; line++) {
    const nesting = solidScriptBlockNesting(document.blocks[line], catalog);
    if (off[line]) {
      if (on && depth === 0 && nesting === 'continue') partners.push(line);
      if (on && depth === 0 && nesting === 'close') return [...partners, line];
      continue;
    }
    if (nesting === 'open') depth += 1;
    else if (nesting === 'close' && depth > 0) depth -= 1;
    else if (nesting === 'close') return on ? [] : [...partners, line];
    else if (nesting === 'continue' && depth === 0 && !on) partners.push(line);
  }
  return on ? [] : partners;
}

/**
 * Turns exactly the given lines off, or on again when all of them are off; the
 * lines inside a block stay as they are and then run without it. A block line
 * takes its End and Else along, so the script keeps working: turning it off
 * turns them off, and turning it on turns on the off End and Else on its level
 * when it has no End.
 *
 * @param document Script.
 * @param lines Line indexes.
 * @param catalog Commands the lines are found in.
 * @returns Edited script, and how many picked lines changed and whether they
 *   are off now.
 */
export function solidScriptDocumentLinesToggle(
  document: SolidScriptDocument,
  lines: readonly number[],
  catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
): { document: SolidScriptDocument; count: number; off: boolean } {
  const picked = [...new Set(lines)].filter((line) => line >= 0 && line < document.blocks.length).sort((a, b) => b - a);
  const off = !picked.every((line) => document.blocks[line]?.off === true);
  // Partners are found in the script as it was, so a picked End is not skipped
  // over to reach an unrelated End further down.
  const before = document.blocks.map((block) => block.off === true);
  const flags = [...before];
  for (const line of picked) flags[line] = off;
  for (const line of picked) {
    if (solidScriptBlockNesting(document.blocks[line], catalog) !== 'open') continue;
    for (const partner of solidScriptDocumentBlockPartners(document, before, line, !off, catalog)) flags[partner] = off;
  }
  const blocks = document.blocks.map((block, line) => {
    if ((block.off === true) === flags[line]) return block;
    const { off: _was, ...rest } = block;
    return flags[line] ? { ...rest, off: true as const } : rest;
  });
  return { document: solidScriptDocumentWith(document, blocks), count: picked.length, off };
}

/**
 * Inserts copied lines with new ids below a line, filling it when it is a blank
 * line.
 *
 * @param document Script.
 * @param index Current line.
 * @param lines Lines to insert.
 * @param keepBlank True never fills a blank current line.
 * @param catalog Commands the lines are found in.
 * @returns Edited script and the first inserted line.
 */
export function solidScriptDocumentLinesInsert(
  document: SolidScriptDocument,
  index: number,
  lines: readonly { command: string; values?: Readonly<Record<string, string>>; off?: boolean }[],
  keepBlank = false,
  catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
): SolidScriptInsertResult {
  const blocks = [...document.blocks];
  const reuse = !keepBlank && solidScriptBlockIsBlank(blocks[index]);
  const line = blocks.length === 0 ? 0 : Math.max(0, Math.min(reuse ? index : index + 1, blocks.length));
  const inserted = lines.map((entry) =>
    solidScriptBlockCreate(entry.command, { ...entry.values }, entry.off === true, catalog),
  );
  blocks.splice(line, reuse ? 1 : 0, ...inserted);
  return { document: solidScriptDocumentWith(document, blocks), line };
}
