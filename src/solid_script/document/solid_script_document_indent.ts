import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import type { SolidScriptCommandNesting } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';

/**
 * Returns how a line shapes the block structure; unknown commands are plain
 * lines.
 *
 * @param block Line, or undefined.
 * @param catalog Commands the line's command is found in.
 * @returns Nesting of the line's command.
 */
export function solidScriptBlockNesting(
  block: SolidScriptBlock | undefined,
  catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
): SolidScriptCommandNesting {
  return block ? (catalog.find(block.command)?.nesting ?? 'none') : 'none';
}

/**
 * Returns the display indent of every line: lines inside a block are one level
 * deeper than the line that opens it; an End or Else sits at the level of its
 * opener.
 *
 * @param document Script.
 * @param catalog Commands the lines are found in.
 * @returns Indent level per line.
 */
export function solidScriptDocumentDepths(
  document: SolidScriptDocument,
  catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
): number[] {
  let depth = 0;
  return document.blocks.map((block) => {
    const nesting = solidScriptBlockNesting(block, catalog);
    const shown = nesting === 'close' || nesting === 'continue' ? Math.max(0, depth - 1) : depth;
    if (nesting === 'open') depth += 1;
    if (nesting === 'close') depth = Math.max(0, depth - 1);
    return shown;
  });
}

/**
 * Tells for every line whether it is off. Only lines turned off themselves are;
 * the lines inside an off block line run without it.
 *
 * @param document Script.
 * @returns True per line that does not run because it is off.
 */
export function solidScriptDocumentOffLines(document: SolidScriptDocument): boolean[] {
  return document.blocks.map((block) => block.off === true);
}
