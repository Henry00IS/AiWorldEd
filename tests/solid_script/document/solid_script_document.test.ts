import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptBlockCreate,
  solidScriptDocumentCreate,
  solidScriptDocumentDefault,
  solidScriptDocumentNormalize,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentSource } from '@/solid_script/document/solid_script_document_source.js';
import { solidScriptDocumentDepths } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';

describe('solid script document', () => {
  it('writes one source line per command line, so error and step lines match editor lines', () => {
    const document = solidScriptDocumentCreate([
      { command: 'translate' },
      { command: 'cube', values: { size: '[1, 1, 1]' } },
      { command: 'end' },
      { command: 'sphere', values: { r: 'unknown_size +' } },
    ]);
    const source = solidScriptDocumentSource(document);
    expect(source.split('\n')).toHaveLength(4);
    expect(source.split('\n')[0]).toBe('translate(v = [0, 0, 1]) {');
    expect(() => solidScriptProgramEvaluate(source)).toThrow(/line 4/);
  });

  it('writes blank lines as empty source lines and keeps the script name', () => {
    const document = solidScriptDocumentCreate([{ command: 'blank' }, { command: 'cube' }], 'Door');
    expect(solidScriptDocumentSource(document).split('\n')[0]).toBe('');
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
    expect(() => solidScriptProgramEvaluate(solidScriptDocumentSource(document))).toThrow(/line 1.*Teleport/);
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

  it('starts new generators with a named script that builds a shape', () => {
    const script = solidScriptDocumentDefault();
    expect(script.name).not.toBe('');
    expect(solidScriptProgramEvaluate(solidScriptDocumentSource(script)).shapes.length).toBeGreaterThan(0);
    expect(script.blocks.every((block) => block.id !== solidScriptBlockCreate('cube').id)).toBe(true);
  });
});
