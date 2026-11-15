import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptBlockCreate,
  solidScriptDocumentCreate,
  solidScriptDocumentDefault,
  solidScriptDocumentNormalize,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentDepths } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';

describe('solid script document', () => {
  it('runs the block lines directly, so error and step lines are editor lines', () => {
    const document = solidScriptDocumentCreate([
      { command: 'translate' },
      { command: 'cube', values: { size: '1, 1, 1' } },
      { command: 'end' },
      { command: 'sphere', values: { r: '[unknown_size]' } },
    ]);
    expect(() => solidScriptProgramEvaluate(document)).toThrow(/^line 4: /);
  });

  it('skips blank lines when running, keeping the line numbers, and keeps the script name', () => {
    const document = solidScriptDocumentCreate([{ command: 'blank' }, { command: 'cube' }], 'Door');
    expect(solidScriptProgramEvaluate(document).steps).toEqual([2]);
    expect(document.name).toBe('Door');
    expect(solidScriptDocumentNormalize(document).name).toBe('Door');
  });

  it('keeps lines of unknown commands, reports them on their line and drops anything that is no command', () => {
    const document = solidScriptDocumentNormalize({
      version: SOLID_SCRIPT_DOCUMENT_VERSION,
      blocks: [{ id: 'x', command: 'teleport', values: { to: '3' } }, 'garbage', { type: 'code', code: 'cube(1);' }],
    });
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({ command: 'teleport', values: { to: '3' } });
    expect(() => solidScriptProgramEvaluate(document)).toThrow(/line 1: .*"teleport"/);
  });

  it('normalizes anything else to an empty script and gives every line a unique id', () => {
    expect(solidScriptDocumentNormalize(null)).toEqual({
      version: SOLID_SCRIPT_DOCUMENT_VERSION,
      name: '',
      blocks: [],
    });
    expect(solidScriptDocumentNormalize('text').blocks).toEqual([]);
    const repeated = solidScriptDocumentNormalize({
      blocks: [
        { id: 'same', command: 'cube' },
        { id: 'same', command: 'sphere' },
      ],
    });
    expect(new Set(repeated.blocks.map((block) => block.id)).size).toBe(2);
  });

  it('indents the lines inside blocks for display, an Else at the level of its If', () => {
    const document = solidScriptDocumentCreate(
      ['translate', 'if', 'cube', 'note', 'else', 'sphere', 'end', 'end', 'blank'].map((command) => ({ command })),
    );
    expect(solidScriptDocumentDepths(document)).toEqual([0, 1, 2, 2, 1, 2, 1, 0, 0]);
  });

  it('starts new generators with a named, centred script that builds a shape without any Translate or Detail', () => {
    const script = solidScriptDocumentDefault();
    expect(script.name).not.toBe('');
    expect(script.blocks.map((block) => block.command)).not.toContain('translate');
    expect(script.blocks.map((block) => block.command)).not.toContain('detail');
    expect(solidScriptProgramEvaluate(script).shapes.length).toBeGreaterThan(0);
    expect(script.blocks.every((block) => block.id !== solidScriptBlockCreate('cube').id)).toBe(true);
  });
});
