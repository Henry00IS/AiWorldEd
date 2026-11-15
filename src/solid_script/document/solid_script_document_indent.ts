import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandNesting } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';

/**
 * Returns how a line shapes the block structure; unknown commands are plain
 * lines.
 *
 * @param block Line, or undefined.
 * @returns Nesting of the line's command.
 */
export function solidScriptBlockNesting(block: SolidScriptBlock | undefined): SolidScriptCommandNesting {
  return block ? (solidScriptCommandFind(block.command)?.nesting ?? 'none') : 'none';
}

/**
 * Returns the display indent of every line: lines inside a block are one level
 * deeper than the line that opens it; an End or Else sits at the level of its
 * opener.
 *
 * @param document Script.
 * @returns Indent level per line.
 */
export function solidScriptDocumentDepths(document: SolidScriptDocument): number[] {
  let depth = 0;
  return document.blocks.map((block) => {
    const nesting = solidScriptBlockNesting(block);
    const shown = nesting === 'close' || nesting === 'continue' ? Math.max(0, depth - 1) : depth;
    if (nesting === 'open') depth += 1;
    if (nesting === 'close') depth = Math.max(0, depth - 1);
    return shown;
  });
}
