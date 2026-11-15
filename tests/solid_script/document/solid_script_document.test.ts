import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptBlockCommandCreate,
  solidScriptDocumentDefault,
  solidScriptDocumentNormalize,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentFromSource,
  solidScriptDocumentSource,
} from '@/solid_script/document/solid_script_document_source.js';
import { solidScriptDocumentDepths } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';

describe('solid script document', () => {
  it('writes one source line per block, so error and step lines match editor lines', () => {
    const document = solidScriptDocumentNormalize({
      version: SOLID_SCRIPT_DOCUMENT_VERSION,
      blocks: [
        solidScriptBlockCommandCreate('translate'),
        { id: 'a', type: 'code', code: '  cube([1, 1, 1]);' },
        solidScriptBlockCommandCreate('end'),
        { id: 'b', type: 'code', code: 'sphere(unknown_size + );' },
      ],
    });
    const source = solidScriptDocumentSource(document);
    expect(source.split('\n')).toHaveLength(4);
    expect(source.split('\n')[0]).toBe('translate(v = [0, 0, 1]) {');
    expect(() => solidScriptProgramEvaluate(source)).toThrow(/line 4/);
  });

  it('turns source text into one code block per line and back', () => {
    const text = 'difference() {\n  cube(2);\n\n  sphere(1.2);\n}';
    const document = solidScriptDocumentFromSource(text);
    expect(document.blocks.map((block) => block.type)).toEqual(['code', 'code', 'code', 'code', 'code']);
    expect(solidScriptDocumentSource(document)).toBe(text);
  });

  it('keeps blocks of unknown commands and reports them as errors on their line', () => {
    const document = solidScriptDocumentNormalize({
      version: SOLID_SCRIPT_DOCUMENT_VERSION,
      blocks: [{ id: 'x', type: 'command', command: 'teleport', values: { to: '3' } }, 'garbage', { type: 'code' }],
    });
    expect(document.blocks).toHaveLength(2);
    expect(document.blocks[0]).toMatchObject({ type: 'command', command: 'teleport', values: { to: '3' } });
    expect(document.blocks[1]).toMatchObject({ type: 'code', code: '' });
    expect(() => solidScriptProgramEvaluate(solidScriptDocumentSource(document))).toThrow(/line 1.*Teleport/);
  });

  it('normalizes anything else to an empty script and gives every block a unique id', () => {
    expect(solidScriptDocumentNormalize(null).blocks).toEqual([]);
    expect(solidScriptDocumentNormalize('text').blocks).toEqual([]);
    const repeated = solidScriptDocumentNormalize({
      blocks: [
        { id: 'same', type: 'code', code: 'a = 1;' },
        { id: 'same', type: 'code', code: 'b = 2;' },
      ],
    });
    expect(new Set(repeated.blocks.map((block) => block.id)).size).toBe(2);
  });

  it('indents the lines inside blocks for display', () => {
    const document = solidScriptDocumentFromSource(
      'translate([0, 0, 1]) {\ndifference() {\ncube(2);\n// a { brace in a comment\ns = "}";\n}\n} else {\nx = 1;\n}',
    );
    expect(solidScriptDocumentDepths(document)).toEqual([0, 1, 2, 2, 2, 1, 0, 1, 0]);
  });

  it('starts new generators with a script that builds a shape', () => {
    const { shapes } = solidScriptProgramEvaluate(solidScriptDocumentSource(solidScriptDocumentDefault()));
    expect(shapes.length).toBeGreaterThan(0);
  });
});
