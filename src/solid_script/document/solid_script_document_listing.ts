import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptListingText,
  type SolidScriptListingPart,
} from '@/solid_script/commands/solid_script_command_listing.js';
import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';
import { solidScriptBlockIsBlank } from './solid_script_document_edit.js';
import { solidScriptBlockNesting, solidScriptDocumentDepths } from './solid_script_document_indent.js';

/** Spaces of one indent level in a listing written as text. */
const SOLID_SCRIPT_LISTING_INDENT = '    ';

/**
 * Finds the line that opens the block every End line closes.
 *
 * @param document Script.
 * @returns Opening line per line, -1 for other lines and an End without one.
 */
export function solidScriptDocumentBlockOpeners(document: SolidScriptDocument): number[] {
  const open: number[] = [];
  return document.blocks.map((block, line) => {
    const nesting = solidScriptBlockNesting(block);
    if (nesting === 'open') open.push(line);
    return nesting === 'close' ? (open.pop() ?? -1) : -1;
  });
}

/**
 * Names the block every End line closes, such as "Difference" or "When".
 *
 * @param document Script.
 * @param openers Opening line per line, from solidScriptDocumentBlockOpeners.
 * @returns Name per line, empty for other lines.
 */
export function solidScriptDocumentClosedBlocks(
  document: SolidScriptDocument,
  openers = solidScriptDocumentBlockOpeners(document),
): string[] {
  return openers.map((opener) => {
    const block = document.blocks[opener];
    return block ? (solidScriptCommandFind(block.command)?.endLabel ?? 'Block') : '';
  });
}

/**
 * Returns how one line is listed: an End names the block it closes, an unknown
 * command says so, every other line lists its command.
 *
 * @param block Line.
 * @param closes Label of the block an End closes.
 * @returns Pieces.
 */
export function solidScriptBlockListing(block: SolidScriptBlock, closes: string): SolidScriptListingPart[] {
  const command = solidScriptCommandFind(block.command);
  if (!command) return [{ kind: 'name', text: `Unknown Command: ${block.command}` }];
  if (solidScriptBlockNesting(block) === 'close' && closes) return [{ kind: 'name', text: `End ${closes}` }];
  return command.listing(block.values);
}

/**
 * Returns the script as the editor lists it, one text line per line, indented
 * by block; blank lines stay empty.
 *
 * @param document Script.
 * @returns Listed lines.
 */
export function solidScriptDocumentListing(document: SolidScriptDocument): string[] {
  const depths = solidScriptDocumentDepths(document);
  const closes = solidScriptDocumentClosedBlocks(document);
  return document.blocks.map((block, line) =>
    solidScriptBlockIsBlank(block)
      ? ''
      : SOLID_SCRIPT_LISTING_INDENT.repeat(depths[line] ?? 0) +
        solidScriptListingText(solidScriptBlockListing(block, closes[line] ?? '')),
  );
}
