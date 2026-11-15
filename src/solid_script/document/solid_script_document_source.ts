import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptBlockCodeCreate,
  type SolidScriptBlock,
  type SolidScriptDocument,
} from './solid_script_document.js';

/**
 * Writes the code of one line; an unknown command becomes a failing check that
 * names it, so the script reports it on its line.
 *
 * @param block Line.
 * @returns One line of code.
 */
export function solidScriptBlockSource(block: SolidScriptBlock): string {
  if (block.type === 'code') return block.code;
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

/**
 * Turns source text into a script of code lines.
 *
 * @param source Source text.
 * @returns Script with one code line per source line.
 */
export function solidScriptDocumentFromSource(source: string): SolidScriptDocument {
  return {
    version: SOLID_SCRIPT_DOCUMENT_VERSION,
    blocks: source.split(/\r?\n/).map((line) => solidScriptBlockCodeCreate(line)),
  };
}
