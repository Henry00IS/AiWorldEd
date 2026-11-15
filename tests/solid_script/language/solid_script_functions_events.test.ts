import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptInputsList } from '@/solid_script/language/solid_script_input.js';
import { solidScriptOffset } from '@/solid_script/language/solid_script_offset.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines.
 *
 * @param options Program options.
 * @param lines Lines.
 * @returns Run result.
 */
function runWith(options: SolidScriptProgramOptions, ...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), options);
}

/**
 * Runs script lines without options.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return runWith({}, ...lines);
}

/**
 * A line of a command.
 *
 * @param command Command id.
 * @param values Field values.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * An Echo line.
 *
 * @param value Message.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return line('echo', { value });
}

/**
 * Rounded XY bounds of all solids, as min x, y then max x, y.
 *
 * @param shapes Shapes.
 * @returns Bounds.
 */
function boundsXY(shapes: readonly SolidScriptShape[]): number[] {
  const points = shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : []));
  const box = new THREE.Box3().setFromPoints(points);
  return [box.min.x, box.min.y, box.max.x, box.max.y].map((value) => Math.round(value * 1000) / 1000 + 0);
}

describe('Define Function', () => {
  it('lets formulas call it, also before the line, and recursively', () => {
    const result = run(
      line('cube'),
      echo('[=area(2, 3)] [=fact(5)]'),
      line('function', { name: 'area', parameters: 'w, d', result: '[w] * [d]' }),
      line('function', { name: 'fact', parameters: 'n', result: '[n] <= 1 ? 1 : [n] * fact([n] - 1)' }),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['6 120']);
  });

  it('sees top-level variables but not the caller’s counters', () => {
    const result = run(
      line('variable', { name: 'scale', value: '10' }),
      line('function', { name: 'scaled', parameters: 'x', result: '[x] * [scale]' }),
      echo('[=scaled(2)]'),
    );
    expect(result.messages).toEqual(['20']);
  });

  it('stops on a wrong value count, a built-in name, an unknown function and endless recursion', () => {
    const count = run(line('function', { name: 'f', parameters: 'a, b', result: '[a]' }), echo('[=f(1)]'));
    expect(count.error?.message).toMatch(/f\(\) takes 2 value\(s\).*not 1/);
    const builtin = run(line('function', { name: 'sin', parameters: 'x', result: '[x]' }));
    expect(builtin.error?.message).toMatch(/sin.*built-in/);
    const unknown = run(echo('[=nope(1)]'));
    expect(unknown.error?.message).toMatch(/unknown function nope\(\); define it with Define Function/);
    const endless = run(line('function', { name: 'loop', parameters: 'x', result: 'loop([x])' }), echo('[=loop(1)]'));
    expect(endless.error?.message).toMatch(/64/);
  });
});

describe('When Event and Raise Event', () => {
  it('runs start before and finish after the other lines, and named events where raised', () => {
    const result = run(
      line('event', { name: 'finish' }),
      echo('done [count]'),
      END,
      line('event', { name: 'start' }),
      line('variable', { name: 'count', value: '0' }),
      END,
      line('event', { name: 'step' }),
      line('variable', { name: 'count', value: '[=[count] + 1]' }),
      END,
      line('repeat', { variable: 'i', from: '1', to: '3' }),
      line('raise_event', { name: 'step' }),
      END,
      line('raise_event', { name: 'nobody' }),
      echo('body [count]'),
      line('cube'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['body 3', 'done 3']);
  });

  it('builds shapes where the event is raised', () => {
    const result = run(
      line('event', { name: 'post' }),
      line('cube', { size: '1, 1, 1' }),
      END,
      line('translate', { v: '5, 0, 0' }),
      line('raise_event', { name: 'post' }),
      END,
    );
    expect(result.error).toBeNull();
    expect(boundsXY(result.shapes)).toEqual([4.5, -0.5, 5.5, 0.5]);
  });
});

describe('Input', () => {
  const steps = line('input', { name: 'steps', type: 'count', default: '3', min: '1', max: '10' });

  it('uses the default, or the inspector value, as a read-only variable', () => {
    expect(run(steps, echo('[steps]')).messages).toEqual(['3']);
    expect(runWith({ inputs: { steps: '7' } }, steps, echo('[steps]')).messages).toEqual(['7']);
    const write = run(steps, line('variable', { name: 'steps', value: '4' }));
    expect(write.error?.message).toMatch(/steps.*input.*read/i);
  });

  it('checks the value against its type and limits', () => {
    expect(runWith({ inputs: { steps: '11' } }, steps).error?.message).toMatch(/from 1 to 10, not 11/);
    expect(runWith({ inputs: { steps: '2.5' } }, steps).error?.message).toMatch(/whole number/);
    const choice = line('input', { name: 'look', type: 'choice', default: 'small', choices: 'small, large' });
    expect(runWith({ inputs: { look: 'large' } }, choice, echo('[look]')).messages).toEqual(['large']);
    expect(runWith({ inputs: { look: 'huge' } }, choice).error?.message).toMatch(/one of small, large/);
    const toggle = line('input', { name: 'rails', type: 'switch', default: 'yes' });
    expect(run(toggle, line('if', { condition: '[rails]' }), echo('on'), END).messages).toEqual(['on']);
    expect(run(line('input', { name: 'x', type: 'colour' })).error?.message).toMatch(/Type must be one of/);
    expect(run(steps, steps).error?.message).toMatch(/steps/);
  });

  it('lists the inputs for the inspector without running', () => {
    const inputs = solidScriptInputsList(
      solidScriptDocumentCreate([
        steps,
        line('input', { name: 'look', type: 'choice', choices: 'a, b', label: 'Look' }),
      ]).blocks,
    );
    expect(inputs.map((input) => [input.name, input.label, input.type, input.fallback, input.min, input.max])).toEqual([
      ['steps', 'steps', 'count', '3', 1, 10],
      ['look', 'Look', 'choice', '1', null, null],
    ]);
  });
});

describe('Remove Item', () => {
  it('removes an item by number or the last one', () => {
    const result = run(
      line('cube'),
      ...['a', 'b', 'c', 'd'].map((value) => line('variable', { name: 'names()', value })),
      line('remove_item', { target: 'names(1)' }),
      line('remove_item', { target: 'names()' }),
      echo('[names(0)] [names(1)] [names().count]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['a c 2']);
  });

  it('stops past the end and on a value that is not a list', () => {
    const past = run(
      line('variable', { name: 'names()', value: 'a' }),
      line('variable', { name: 'names()', value: 'b' }),
      line('remove_item', { target: 'names(2)' }),
    );
    expect(past.error?.message).toMatch(/names\(2\) is past the end/);
    const plain = run(line('variable', { name: 'w', value: '2' }), line('remove_item', { target: 'w()' }));
    expect(plain.error?.message).toMatch(/not a list/);
  });
});

describe('Offset', () => {
  const square = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ] as [number, number][];

  it('grows sharp and round, and shrinks a convex outline', () => {
    const sharp = solidScriptOffset(square, { distance: 0.5, round: false, sides: 16 });
    expect(sharp).toHaveLength(1);
    expect(new THREE.Box2().setFromPoints(sharp[0]!.map(([x, y]) => new THREE.Vector2(x, y))).min.toArray()).toEqual([
      -0.5, -0.5,
    ]);
    const round = solidScriptOffset(square, { distance: 0.5, round: true, sides: 16 });
    expect(round[0]!.length).toBeGreaterThan(4);
    const inset = solidScriptOffset(square, { distance: -0.5, round: true, sides: 16 });
    expect(inset[0]!.map((p) => p.map((v) => Math.round(v * 1000) / 1000 + 0))).toEqual(
      expect.arrayContaining([
        [0.5, 0.5],
        [1.5, 1.5],
      ]),
    );
    expect(() => solidScriptOffset(square, { distance: -1, round: false, sides: 16 })).toThrow(
      /shrinks the outline away/,
    );
  });

  it('builds inside Linear Extrude and stops outside it or on a concave inset', () => {
    const result = run(
      line('linear_extrude', { height: '1' }),
      line('offset', { distance: '0.5', round: 'false' }),
      line('square', { size: '2, 2' }),
      END,
      END,
    );
    expect(result.error).toBeNull();
    expect(boundsXY(result.shapes)).toEqual([-1.5, -1.5, 1.5, 1.5]);
    expect(run(line('offset'), line('square'), END).error?.message).toMatch(/inside Linear Extrude/);
    const concave = run(
      line('linear_extrude'),
      line('offset', { distance: '-0.1' }),
      line('polygon', { points: '0, 0; 3, 0; 3, 1; 1, 1; 1, 3; 0, 3' }),
      END,
      END,
      END,
    );
    expect(concave.error?.message).toMatch(/negative Distance needs a convex outline/);
    const corner: [number, number][] = [
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ];
    expect(() => solidScriptOffset(corner, { distance: 0.2, round: false, sides: 16 })).toThrow(
      /sharp corners need a convex/,
    );
    const grown = solidScriptOffset(corner, { distance: 0.2, round: true, sides: 16 }).flat();
    expect(Math.min(...grown.map(([x]) => x))).toBeCloseTo(-0.2, 5);
    expect(Math.max(...grown.map(([, y]) => y))).toBeCloseTo(3.2, 5);
  });
});
