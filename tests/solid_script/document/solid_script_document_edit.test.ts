import { describe, expect, it } from 'vitest';
import { solidScriptDocumentFromSource } from '@/solid_script/document/solid_script_document_source.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentBlockRange,
  solidScriptDocumentCommandInsert,
  solidScriptDocumentLineRemove,
  solidScriptDocumentLineSplit,
  solidScriptDocumentMove,
} from '@/solid_script/document/solid_script_document_edit.js';

/**
 * Lists each line as its command id or its code.
 *
 * @param document Script.
 * @returns One entry per line.
 */
function lines(document: SolidScriptDocument): string[] {
  return document.blocks.map((block) => (block.type === 'command' ? `[${block.command}]` : block.code));
}

describe('solid script document edits', () => {
  it('fills the current line when it is blank or only whitespace', () => {
    const script = solidScriptDocumentFromSource('a = 1;\n   \nb = 2;');
    const { document, line } = solidScriptDocumentCommandInsert(script, 'cube', 1, 'caret');
    expect(lines(document)).toEqual(['a = 1;', '[cube]', 'b = 2;']);
    expect(line).toBe(1);
    expect(script.blocks).toHaveLength(3);
  });

  it('adds a new line below a line that has content', () => {
    const script = solidScriptDocumentFromSource('a = 1;\nb = 2;');
    const { document, line } = solidScriptDocumentCommandInsert(script, 'sphere', 0, 'caret');
    expect(lines(document)).toEqual(['a = 1;', '[sphere]', 'b = 2;']);
    expect(line).toBe(1);
  });

  it('drops before a line, closes blocks with an End line and inserts into an empty script', () => {
    const script = solidScriptDocumentFromSource('a = 1;\nb = 2;');
    expect(lines(solidScriptDocumentCommandInsert(script, 'difference', 1, 'before').document)).toEqual([
      'a = 1;',
      '[difference]',
      '[end]',
      'b = 2;',
    ]);
    const empty = solidScriptDocumentCommandInsert({ version: 1, blocks: [] }, 'cube', 0, 'caret');
    expect(lines(empty.document)).toEqual(['[cube]']);
  });

  it('moves and removes a block opener together with its End, keeping the lines inside', () => {
    let script = solidScriptDocumentFromSource('x = 0;');
    script = solidScriptDocumentCommandInsert(script, 'translate', 0, 'caret').document;
    script = solidScriptDocumentCommandInsert(script, 'cube', 1, 'caret').document;
    expect(lines(script)).toEqual(['x = 0;', '[translate]', '[cube]', '[end]']);
    expect(solidScriptDocumentBlockRange(script, 1)).toEqual([1, 3]);
    expect(lines(solidScriptDocumentMove(script, 1, 0))).toEqual(['[translate]', '[cube]', '[end]', 'x = 0;']);
    expect(lines(solidScriptDocumentLineRemove(script, 1))).toEqual(['x = 0;', '[cube]']);
  });

  it('splits a code line at the caret', () => {
    const script = solidScriptDocumentFromSource('a = 1; b = 2;');
    expect(lines(solidScriptDocumentLineSplit(script, 0, 6))).toEqual(['a = 1;', ' b = 2;']);
  });
});
