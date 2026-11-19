import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Rounds the corner points of a solid shape for comparison.
 *
 * @param shape Shape.
 * @returns Points as x,y,z strings.
 */
function corners(shape: SolidScriptShape | undefined): string[] {
  if (shape?.kind !== 'solid') return [];
  return shape.points.map((point) =>
    [point.x, point.y, point.z].map((value) => Math.round(value * 100) / 100 + 0).join(','),
  );
}

const END: SolidScriptLine = { command: 'end' };

/**
 * A Set line.
 *
 * @param name Name or item.
 * @param value Value.
 * @returns Line.
 */
function set(name: string, value: string): SolidScriptLine {
  return { command: 'variable', values: { name, value } };
}

/**
 * An Echo line.
 *
 * @param value Message.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

describe('SolidScript lists', () => {
  it('adds items with name(), changes them with name(index) and reads items and the count', () => {
    const result = run(
      set('names()', 'arch'),
      set('names()', 'column'),
      set('names(1)', 'stairs'),
      set('names(2)', 'hole'),
      echo('[names(0)] [names(1)] [names(2)] [names.count]'),
      { command: 'cube' },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['arch stairs hole 3']);
  });

  it('reads and writes items through variables and formulas in the brackets', () => {
    const result = run(
      set('sizes', '1, 2, 3'),
      set('i', '1'),
      set('sizes([=[i] + 1])', '9'),
      echo('[sizes([i])] [sizes(2)] [=len([sizes])]'),
      { command: 'cube' },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['2 9 3']);
  });

  it('stops at an item past the end with the valid range in the message', () => {
    const result = run(set('sizes', '1, 2, 3'), echo('[sizes(3)]'), { command: 'cube' });
    expect(result.error?.line).toBe(2);
    expect(result.error?.message).toMatch(/sizes\(3\) does not exist: sizes has 3 items, numbered 0 to 2/);
    const gap = run(set('sizes', '1, 2'), set('sizes(5)', '1'), { command: 'cube' });
    expect(gap.error?.message).toMatch(/past the end.*next one is sizes\(2\)/);
  });

  it('runs For Each once per item, from a typed list or a list variable', () => {
    const result = run(
      set('steps()', '4'),
      set('steps()', '7'),
      { command: 'for_each', values: { variable: 'h', list: '1, 2' } },
      echo('typed [h]'),
      END,
      { command: 'for_each', values: { variable: 'h', list: '[steps]' } },
      echo('listed [h]'),
      END,
      { command: 'cube' },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['typed 1', 'typed 2', 'listed 4', 'listed 7']);
  });
});

describe('SolidScript Point lines', () => {
  it('builds a Polyhedron from Point lines, moved by the blocks between them', () => {
    const result = run(
      { command: 'polyhedron' },
      { command: 'point', values: { position: '0, 0, 0' } },
      { command: 'point', values: { position: '1, 0, 0' } },
      { command: 'point', values: { position: '0, 1, 0' } },
      { command: 'translate', values: { v: '0, 0, 2' } },
      { command: 'point', values: { position: '0, 0, 0' } },
      END,
      END,
    );
    expect(result.error).toBeNull();
    expect(result.shapes).toHaveLength(1);
    expect(corners(result.shapes[0])).toEqual(['0,0,0', '1,0,0', '0,1,0', '0,0,2']);
  });

  it('takes points from loops and from a list variable', () => {
    const result = run(
      set('base()', '0, 0, 0'),
      set('base()', '2, 0, 0'),
      { command: 'polyhedron', values: { points: '[base]' } },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '1' } },
      { command: 'point', values: { position: '[i], 1, [i]' } },
      END,
      END,
    );
    expect(result.error).toBeNull();
    expect(corners(result.shapes[0])).toEqual(['0,0,0', '2,0,0', '0,1,0', '1,1,1']);
  });

  it('explains too few points and shapes among the Point lines', () => {
    const few = run({ command: 'polyhedron' }, { command: 'point' }, END);
    expect(few.error?.message).toMatch(/at least 4 corners and has 1/);
    const shape = run({ command: 'polyhedron' }, { command: 'cube' }, END);
    expect(shape.error?.line).toBe(2);
    expect(shape.error?.message).toMatch(/Cube cannot be inside a Polyhedron or Polygon/);
    const loose = run({ command: 'point' }, { command: 'cube' });
    expect(loose.error?.message).toMatch(
      /a Point belongs between a Polyhedron, Polygon, Hull or Mesh line and its End/,
    );
  });

  it('extrudes a Polygon of Point lines', () => {
    const result = run(
      { command: 'linear_extrude' },
      { command: 'polygon' },
      { command: 'point', values: { position: '0, 0, 0' } },
      { command: 'point', values: { position: '2, 0, 0' } },
      { command: 'point', values: { position: '1, 2, 0' } },
      END,
      END,
    );
    expect(result.error).toBeNull();
    expect(result.shapes[0]?.kind).toBe('solid');
  });
});

describe('SolidScript Output of a Part', () => {
  it('lets a Function call itself until an If stops it, and hands results back through Set', () => {
    const result = run(
      set('n', '0'),
      set('total', '0'),
      { command: 'function', values: { name: 'count' } },
      { command: 'if', values: { condition: '[n] < 4' } },
      set('n', '[=[n] + 1]'),
      set('total', '[=[total] + [n]]'),
      { command: 'call', values: { name: 'count' } },
      END,
      END,
      { command: 'call', values: { name: 'count' } },
      echo('[n] [total]'),
      { command: 'cube' },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['4 10']);
  });

  it('stops Output when the Part line has not run yet', () => {
    const result = run(
      { command: 'output', values: { of: '[loop]' } },
      { command: 'part', values: { name: 'loop' } },
      { command: 'cube' },
      END,
    );
    expect(result.error?.message).toMatch(/no variable \[loop\]/);
  });

  it('chooses the part by a variable', () => {
    const result = run(
      { command: 'part', values: { name: 'post' } },
      echo('post'),
      { command: 'cube' },
      END,
      set('which', 'post'),
      { command: 'output', values: { of: '[which]' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['post']);
    expect(result.shapes).toHaveLength(1);
  });

  it('reads Positions through a vertex list, and hints when the singular is used', () => {
    const cube = { command: 'cube', values: { into: 'Brush' } };
    const counted = run(cube, echo('[Brush.Vertices.Positions.Count]'));
    expect(counted.error).toBeNull();
    expect(counted.messages).toEqual(['8']);
    const wrong = run(cube, echo('[Brush.Vertices.Position]'));
    expect(wrong.error?.message ?? '').toMatch(/Did you mean Positions\? Vertices is a list/);
  });
});
