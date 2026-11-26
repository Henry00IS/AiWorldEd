import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptBlockCreate,
  solidScriptDocumentCreate,
  solidScriptDocumentDefault,
  solidScriptDocumentNormalize,
  solidScriptDocumentVersionRead,
  solidScriptDocumentVersionWith,
} from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptDocumentDepths } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';

/**
 * Center of a built solid, from its corner points.
 *
 * @param shape Shape.
 * @returns Center.
 */
function shapeCenter(shape: SolidScriptShape): THREE.Vector3 {
  if (shape.kind !== 'solid') throw new Error('expected a solid');
  return new THREE.Box3().setFromPoints(shape.points).getCenter(new THREE.Vector3());
}

describe('solid script document', () => {
  it('runs the block lines directly, so error and step lines are editor lines', () => {
    const document = solidScriptDocumentCreate([
      { command: 'transform' },
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

  it('keeps lines turned off through saving and loading', () => {
    const document = solidScriptDocumentCreate([{ command: 'cube' }, { command: 'sphere', off: true }]);
    const loaded = solidScriptDocumentNormalize(JSON.parse(JSON.stringify(document)));
    expect(loaded.blocks.map((block) => block.off === true)).toEqual([false, true]);
    expect(solidScriptProgramEvaluate(loaded).steps).toEqual([1]);
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
      ['transform', 'if', 'cube', 'note', 'else', 'sphere', 'end', 'end', 'blank'].map((command) => ({ command })),
    );
    expect(solidScriptDocumentDepths(document)).toEqual([0, 1, 2, 2, 1, 2, 1, 0, 0]);
  });

  it('starts new generators with a named, centered script that builds a shape without any Transform or Detail', () => {
    const script = solidScriptDocumentDefault();
    expect(script.name).not.toBe('');
    expect(script.blocks.map((block) => block.command)).not.toContain('transform');
    expect(script.blocks.map((block) => block.command)).not.toContain('detail');
    expect(script.blocks.some((block) => (block.values['size'] ?? '').includes('[$Box.'))).toBe(false);
    const result = solidScriptProgramEvaluate(script);
    expect(result.shapes.length).toBeGreaterThan(0);
    for (const shape of result.shapes) expect(shapeCenter(shape).length()).toBeCloseTo(0, 6);
    expect(script.blocks.every((block) => block.id !== solidScriptBlockCreate('cube').id)).toBe(true);
  });

  it('reads a missing or unknown script version as 1 and keeps version 1 through a save', () => {
    expect(solidScriptDocumentVersionRead(undefined)).toBe(1);
    expect(solidScriptDocumentNormalize({ blocks: [{ id: 'a1', command: 'cube', values: {} }] }).version).toBe(1);
    expect(solidScriptDocumentNormalize({ version: 1, name: 'Door', blocks: [] }).version).toBe(
      SOLID_SCRIPT_DOCUMENT_VERSION,
    );
    const created = solidScriptDocumentCreate([{ command: 'cube' }], 'Door');
    expect(created.version).toBe(1);
    const kept = solidScriptDocumentNormalize(JSON.parse(JSON.stringify(created)));
    expect(kept.version).toBe(1);
    expect(solidScriptDocumentVersionWith(created, 1).version).toBe(1);
  });
});
