import type { SolidScriptDocument } from './solid_script_document.js';
import { solidScriptBlockSource } from './solid_script_document_source.js';

/** Brace balance of one line, ignoring strings and comments. */
interface SolidScriptLineBraces {
  /** True when the line starts by closing a block. */
  leadingClose: boolean;
  /** Opened minus closed braces. */
  balance: number;
}

/**
 * Returns the display depth of every line: how many blocks it sits in, with
 * closing lines shown at the depth of their opener.
 *
 * @param document Script.
 * @returns Depth per line.
 */
export function solidScriptDocumentDepths(document: SolidScriptDocument): number[] {
  let depth = 0;
  return document.blocks.map((block) => {
    const braces = solidScriptLineBraces(solidScriptBlockSource(block));
    const shown = Math.max(0, depth - (braces.leadingClose ? 1 : 0));
    depth = Math.max(0, depth + braces.balance);
    return shown;
  });
}

/**
 * Counts the braces of one line outside strings and comments.
 *
 * @param line Code line.
 * @returns Leading close flag and balance.
 */
export function solidScriptLineBraces(line: string): SolidScriptLineBraces {
  let balance = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quoted) {
      if (character === '\\') index++;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '/' && line[index + 1] === '/') break;
    if (character === '"') quoted = true;
    if (character === '{') balance++;
    if (character === '}') balance--;
  }
  return { leadingClose: line.trimStart().startsWith('}'), balance };
}
