import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptBlockTree } from '@/solid_script/language/solid_script_block_tree.js';
import { SolidScriptMachine } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

/**
 * Returns the bounds of a solid shape.
 *
 * @param shape Shape.
 * @returns Box.
 */
function bounds(shape: SolidScriptShape | undefined): THREE.Box3 {
  if (shape?.kind !== 'solid') throw new Error('expected a solid');
  return new THREE.Box3().setFromPoints(shape.points);
}

/**
 * Builds a script from lines.
 *
 * @param lines Lines.
 * @returns Script.
 */
function script(...lines: SolidScriptLine[]) {
  return solidScriptDocumentCreate(lines);
}

describe('solidScriptProgramRun', () => {
  it('runs one script again with new inputs, and Function locals stay per call', () => {
    const document = solidScriptDocumentCreate([
      { command: 'input', values: { name: 'n', type: 'Number', default: '1' } },
      { command: 'function', values: { name: 'twice', parameters: 'a' } },
      { command: 'variable', values: { name: 'local.b', value: '[=[local.a] * 2]' } },
      { command: 'return', values: { value: '[local.b]' } },
      { command: 'end' },
      { command: 'echo', values: { value: '[=twice([n]) + twice(10)]' } },
      { command: 'echo', values: { value: '[local.b]' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
    ]);
    const first = solidScriptProgramRun(document, { inputs: { n: '1' } });
    expect(first.messages).toEqual(['22']);
    expect(first.error?.message).toMatch(/Local\. only works inside a Function/);
    expect(solidScriptProgramRun(document, { inputs: { n: '4' } }).messages).toEqual(['28']);
  });

  it('runs each block directly: a translated cube', () => {
    const { shapes } = solidScriptProgramEvaluate(
      script(
        { command: 'translate', values: { v: '1, 2, 3' } },
        { command: 'cube', values: { size: '2, 4, 6', anchor: 'Center, Center, Center' } },
        { command: 'end' },
      ),
    );
    const box = bounds(shapes[0]);
    expect(box.min.toArray()).toEqual([0, 0, 0]);
    expect(box.max.toArray()).toEqual([2, 4, 6]);
  });

  it('keeps stamped parts in order, and a Subtractive Mode on the door cube stays on it', () => {
    const { shapes } = solidScriptProgramEvaluate(
      script(
        { command: 'part', values: { name: 'wall' } },
        { command: 'cube', values: { size: '4, 0.2, 3', anchor: 'Center, Center, Center' } },
        { command: 'end' },
        { command: 'part', values: { name: 'door' } },
        { command: 'cube', values: { size: '1, 1, 2', anchor: 'Center, Center, Center', mode: 'Subtractive' } },
        { command: 'end' },
        { command: 'output', values: { of: '[wall]' } },
        { command: 'output', values: { of: '[door]' } },
      ),
    );
    expect(
      shapes.map((shape) => [
        shape.label,
        shape.kind,
        shape.kind === 'group' ? shape.mode : shape.kind,
        shape.kind === 'group'
          ? shape.children.map((child) => [
              child.label,
              child.kind === 'solid' ? (child.mode ?? 'Additive') : child.kind,
            ])
          : [],
      ]),
    ).toEqual([
      ['wall', 'group', 'Additive', [['wall', 'Additive']]],
      ['door', 'group', 'Additive', [['door', 'Subtractive']]],
    ]);
  });

  it('applies variables in line order, so a Set inside a Repeat counts up across rounds', () => {
    const { shapes, messages } = solidScriptProgramEvaluate(
      script(
        { command: 'variable', values: { name: 'height', value: '0' } },
        { command: 'repeat', values: { variable: 'i', from: '1', to: '3' } },
        { command: 'variable', values: { name: 'height', value: '[=[height] + [i]]' } },
        { command: 'end' },
        { command: 'echo', values: { value: '[height]' } },
        { command: 'cube', values: { size: '1, 1, [height]', anchor: 'Center, Center, Center' } },
      ),
    );
    expect(messages).toEqual(['6']);
    expect(bounds(shapes[0]).getSize(new THREE.Vector3()).z).toBe(6);
  });

  it('does not let a line use a variable set below it', () => {
    const result = solidScriptProgramRun(
      script(
        { command: 'cube', values: { size: '[width]', anchor: 'Center, Center, Center' } },
        { command: 'variable', values: { name: 'width', value: '2' } },
      ),
    );
    expect(result.error?.line).toBe(1);
    expect(result.error?.message).toMatch(/there is no variable \[width\]/);
  });

  it('uses Sides on cylinders and degrees in rotate', () => {
    const { shapes } = solidScriptProgramEvaluate(
      script(
        { command: 'rotate', values: { a: '90, 0, 0' } },
        { command: 'cylinder', values: { h: '2', r1: '1', r2: '1', anchor: 'Center, Bottom, Center', sides: '8' } },
        { command: 'end' },
      ),
    );
    const shape = shapes[0];
    expect(shape?.kind === 'solid' && shape.points.length).toBe(16);
    expect(bounds(shape).max.z).toBeCloseTo(2);
  });

  it('rotates about X first, then Y, then Z, around the fixed axes', () => {
    const box = bounds(
      solidScriptProgramEvaluate(
        script(
          { command: 'rotate', values: { a: '90, 0, 90' } },
          { command: 'cube', values: { size: '1, 2, 3', anchor: 'Left, Bottom, Back' } },
          { command: 'end' },
        ),
      ).shapes[0],
    );
    expect(
      [box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z].map((value) => Math.round(value) + 0),
    ).toEqual([0, 3, 0, 1, 0, 2]);
  });

  it('extrudes concave polygons into convex pieces', () => {
    const outline = solidScriptProgramEvaluate(
      script(
        { command: 'linear_extrude', values: { anchor: 'Center' } },
        { command: 'polygon', values: { points: '[0, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]' } },
        { command: 'end' },
        { command: 'end' },
      ),
    ).shapes[0];
    expect(outline?.kind === 'boolean' && outline.operation).toBe('union');
  });

  it('hulls children into one solid', () => {
    const { shapes } = solidScriptProgramEvaluate(
      script(
        { command: 'hull' },
        { command: 'cube', values: { anchor: 'Center, Center, Center' } },
        { command: 'translate', values: { v: '3, 0, 0' } },
        { command: 'sphere', values: { r: '0.5', anchor: 'Center, Center, Center' } },
        { command: 'end' },
        { command: 'end' },
      ),
    );
    expect(shapes).toHaveLength(1);
    expect(bounds(shapes[0]).max.x).toBeCloseTo(3.5, 1);
  });

  it('checks the block structure before anything runs, naming the line', () => {
    expect(
      solidScriptProgramRun(
        script({ command: 'cube', values: { anchor: 'Center, Center, Center' } }, { command: 'end' }),
      ).error?.message,
    ).toMatch(/line 2: this End has no block/);
    expect(
      solidScriptProgramRun(
        script({ command: 'cube', values: { anchor: 'Center, Center, Center' } }, { command: 'else' }),
      ).error?.message,
    ).toMatch(/line 2:/);
    expect(
      solidScriptProgramRun(
        script({ command: 'translate' }, { command: 'cube', values: { anchor: 'Center, Center, Center' } }),
      ).error?.line,
    ).toBe(1);
    expect(
      solidScriptProgramRun(
        script({ command: 'cube', values: { anchor: 'Center, Center, Center' } }, { command: 'twist' }),
      ).error?.message,
    ).toMatch(/line 2: .*"twist"/);
    expect(solidScriptProgramRun(script({ command: 'square' })).error?.message).toMatch(/inside a Linear Extrude/);
  });
});

describe('a fresh machine for every run', () => {
  it('refuses to run one machine twice', () => {
    const lines = solidScriptBlockTree(
      script({ command: 'cube', values: { anchor: 'Center, Center, Center' } }).blocks,
      solidScriptCommandFind,
    );
    const machine = new SolidScriptMachine();
    machine.run(lines);
    expect(() => machine.run(lines)).toThrow(/runs once/);
  });

  it('starts every run with no variables, even after a run that changed them', () => {
    const counting = script(
      { command: 'variable', values: { name: 'count', value: '1' } },
      { command: 'variable', values: { name: 'count', value: '[=[count] + 1]' } },
      { command: 'echo', values: { value: '[count]' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
    );
    expect(solidScriptProgramRun(counting).messages).toEqual(['2']);
    expect(solidScriptProgramRun(counting).messages).toEqual(['2']);
    const reading = script(
      { command: 'echo', values: { value: '[count]' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
    );
    expect(solidScriptProgramRun(reading).error?.message).toMatch(/there is no variable \[count\]/);
  });

  it('takes the detail of a round shape only from its own line', () => {
    const fine = script({ command: 'sphere', values: { sides: '32', rings: '16', anchor: 'Center, Center, Center' } });
    const plain = script({ command: 'sphere', values: { anchor: 'Center, Center, Center' } });
    const before = solidScriptProgramEvaluate(plain).shapes;
    solidScriptProgramEvaluate(fine);
    expect(JSON.stringify(solidScriptProgramEvaluate(plain).shapes)).toBe(JSON.stringify(before));
    const mixed = solidScriptProgramEvaluate(
      script(
        { command: 'sphere', values: { sides: '32', rings: '16', anchor: 'Center, Center, Center' } },
        { command: 'sphere', values: { anchor: 'Center, Center, Center' } },
      ),
    ).shapes;
    expect(JSON.stringify(mixed[1])).toBe(JSON.stringify(before[0]));
  });
});
