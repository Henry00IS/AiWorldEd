import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';

/**
 * Writes the code of one line; an unknown command becomes a failing check that
 * names it, so the script reports it on its line.
 *
 * @param block Line.
 * @returns One line of code.
 */
export function solidScriptBlockSource(block: SolidScriptBlock): string {
  const command = solidScriptCommandFind(block.command);
  if (command) return command.code(block.values);
  const name = block.command.replace(/[^A-Za-z0-9_ ]/g, '');
  return `assert(false, "Unknown command: ${name.charAt(0).toUpperCase()}${name.slice(1)}");`;
}

/**
 * Writes the source of a script: line N of the source is line N of the script.
 *
 * @param document Script.
 * @returns Source text.
 */
export function solidScriptDocumentSource(document: SolidScriptDocument): string {
  return document.blocks.map(solidScriptBlockSource).join('\n');
}
