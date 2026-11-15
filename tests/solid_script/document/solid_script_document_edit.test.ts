import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentBlankInsert,
  solidScriptDocumentCommandInsert,
  solidScriptDocumentRangeMove,
  solidScriptDocumentRangeRemove,
} from '@/solid_script/document/solid_script_document_edit.js';

/**
 * Creates a script from command ids.
 *
 * @param commands Command id per line.
 * @returns Script.
 */
function script(...commands: string[]): SolidScriptDocument {
  return solidScriptDocumentCreate(commands.map((command) => ({ command })));
}

/**
 * Lists the command id of each line.
 *
 * @param document Script.
 * @returns One id per line.
 */
function lines(document: SolidScriptDocument): string[] {
  return document.blocks.map((block) => block.command);
}

describe('solid script document edits', () => {
  it('fills the current line when it is blank', () => {
    const before = script('variable', 'blank', 'echo');
    const { document, line } = solidScriptDocumentCommandInsert(before, 'cube', 1, 'caret');
    expect(lines(document)).toEqual(['variable', 'cube', 'echo']);
    expect(line).toBe(1);
    expect(before.blocks).toHaveLength(3);
  });

  it('adds a new line below a line that has a command', () => {
    const { document, line } = solidScriptDocumentCommandInsert(script('variable', 'echo'), 'sphere', 0, 'caret');
    expect(lines(document)).toEqual(['variable', 'sphere', 'echo']);
    expect(line).toBe(1);
  });

  it('drops before a line, closes blocks with an End line and inserts into an empty script', () => {
    expect(
      lines(solidScriptDocumentCommandInsert(script('variable', 'echo'), 'difference', 1, 'before').document),
    ).toEqual(['variable', 'difference', 'end', 'echo']);
    expect(lines(solidScriptDocumentCommandInsert(script(), 'cube', 0, 'caret').document)).toEqual(['cube']);
  });

  it('inserts a blank line below a line, or as the first line of an empty script', () => {
    const { document, line } = solidScriptDocumentBlankInsert(script('cube', 'sphere'), 0);
    expect(lines(document)).toEqual(['cube', 'blank', 'sphere']);
    expect(line).toBe(1);
    expect(lines(solidScriptDocumentBlankInsert(script(), 0).document)).toEqual(['blank']);
  });

  it('moves and removes exactly the lines asked for, End lines too', () => {
    const block = script('variable', 'translate', 'if', 'cube', 'else', 'sphere', 'end', 'end');
    const moved = solidScriptDocumentRangeMove(block, 1, 1, 0);
    expect(lines(moved.document)).toEqual(['translate', 'variable', 'if', 'cube', 'else', 'sphere', 'end', 'end']);
    expect(moved.line).toBe(0);
    const down = solidScriptDocumentRangeMove(block, 6, 7, 1);
    expect(lines(down.document)).toEqual(['variable', 'end', 'end', 'translate', 'if', 'cube', 'else', 'sphere']);
    expect(solidScriptDocumentRangeMove(block, 2, 3, 3).document).toBe(block);
    const removed = solidScriptDocumentRangeRemove(block, 1, 1);
    expect(lines(removed.document)).toEqual(['variable', 'if', 'cube', 'else', 'sphere', 'end', 'end']);
    expect(lines(solidScriptDocumentRangeRemove(block, 7, 6).document)).toEqual(
      lines(script(...['variable', 'translate', 'if', 'cube', 'else', 'sphere'])),
    );
  });
});
