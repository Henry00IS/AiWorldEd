import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  solidScriptProgramHandle,
  solidScriptProgramRun,
  type SolidScriptProgramOptions,
} from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_HANDLERS } from '@/solid_script/language/solid_script_machine.js';
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

/**
 * A Function block line.
 *
 * @param name Function name.
 * @param parameters Input names.
 * @returns Line.
 */
function fn(name: string, parameters = ''): SolidScriptLine {
  return line('function', { name, parameters });
}

/**
 * Builds a Return line.
 *
 * @param value Value given back.
 * @returns Line.
 */
function ret(value: string): SolidScriptLine {
  return line('return', { value });
}

describe('Function blocks', () => {
  it('are skipped from top to bottom, wherever they stand, and run only when called', () => {
    const result = run(
      echo('top'),
      fn('greet', 'who'),
      echo('hello [local.who]'),
      line('cube'),
      END,
      line(SOLID_SCRIPT_HANDLERS.input, { name: 'width' }),
      echo('handler'),
      END,
      line(SOLID_SCRIPT_HANDLERS.button, { name: 'reset' }),
      echo('button'),
      END,
      echo('middle'),
      line('call', { name: 'greet', values: 'World' }),
      echo('bottom'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['top', 'middle', 'hello World', 'bottom']);
    expect(result.shapes).toHaveLength(1);
  });

  it('lets formulas call them before their line, with Return, also recursively', () => {
    const result = run(
      line('cube'),
      echo('[=area(2, 3)] [=fact(5)] [=limit(7)] [=limit(0.5)]'),
      fn('area', 'w, d'),
      ret('[=[local.w] * [local.d]]'),
      END,
      fn('fact', 'n'),
      line('if', { condition: '[local.n] <= 1' }),
      line('return', { value: '1' }),
      END,
      line('return', { value: '[=[local.n] * fact([local.n] - 1)]' }),
      END,
      fn('limit', 'v'),
      line('if', { condition: '[local.v] > 1' }),
      line('return', { value: '1' }),
      END,
      line('return', { value: '[local.v]' }),
      END,
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['6 120 1 0.5']);
  });

  it('builds the shapes of a Call where it stands and stores Return in Result In', () => {
    const result = run(
      fn('post', 'x, h'),
      line('translate', { v: '[local.x], 0, 0' }),
      line('cube', { size: `1, 1, [local.h]` }),
      END,
      line('return', { value: '[=[local.x] + 1]' }),
      END,
      line('call', { name: 'post', values: '[=max(2, 4)], 3', result: 'next' }),
      echo('[next]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['5']);
    expect(boundsXY(result.shapes)).toEqual([3.5, -0.5, 4.5, 0.5]);
  });

  it('keeps local variables to their call, while plain names are the script variables', () => {
    const result = run(
      line('cube'),
      line('variable', { name: 'total', value: '1' }),
      fn('bump', 'by'),
      line('variable', { name: 'local.twice', value: '[=[local.by] * 2]' }),
      line('variable', { name: 'total', value: '[=[total] + [local.twice]]' }),
      line('variable', { name: 'made', value: 'done' }),
      END,
      line('call', { name: 'bump', values: '3' }),
      line('call', { name: 'bump', values: '1' }),
      echo('[total] [made]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['9 done']);
    const leak = run(line('cube'), fn('f', 'a'), END, line('call', { name: 'f', values: '1' }), echo('[a]'));
    expect(leak.error?.message).toMatch(/there is no variable \[a\]/);
  });

  it('stops on misuse with plain explanations', () => {
    const outside = run(line('cube'), echo('[local.x]'));
    expect(outside.error?.message).toMatch(/local\. only works inside a Function; outside one, write \[x\]/);
    const missing = run(line('cube'), fn('f'), echo('[local.y]'), END, line('call', { name: 'f' }));
    expect(missing.error?.message).toMatch(/no local variable \[local\.y\]/);
    const count = run(line('cube'), fn('f', 'a, b'), ret('[local.a]'), END, echo('[=f(1)]'));
    expect(count.error?.message).toMatch(/f\(\) takes 2 value\(s\).*not 1/);
    const builtin = run(line('cube'), fn('sin', 'x'), ret('[local.x]'), END);
    expect(builtin.error?.message).toMatch(/sin.*built-in/);
    const unknown = run(line('cube'), echo('[=nope(1)]'));
    expect(unknown.error?.message).toMatch(/unknown function nope\(\); add a Function block/);
    const noCall = run(line('cube'), line('call', { name: 'nope' }));
    expect(noCall.error?.message).toMatch(/no Function is named "nope"/);
    const builds = run(line('cube'), fn('box'), line('cube'), ret('1'), END, echo('[=box()]'));
    expect(builds.error?.message).toMatch(/box\(\) builds shapes, so use it with a Call line/);
    const noValue = run(line('cube'), fn('quiet'), echo('hi'), END, echo('[=quiet()]'));
    expect(noValue.error?.message).toMatch(/quiet\(\) gives no value/);
    const noResult = run(line('cube'), fn('quiet'), END, line('call', { name: 'quiet', result: 'r' }));
    expect(noResult.error?.message).toMatch(/gives no value to store in r/);
    const partValue = run(
      line('part', { name: 'p' }),
      line('cube'),
      line('return', { value: '1' }),
      END,
      line('use_part', { name: 'p' }),
    );
    expect(partValue.error?.message).toMatch(/Return with a Value only works in a Function/);
    const loose = run(line('cube'), line('return'));
    expect(loose.error?.message).toMatch(/only works inside one of them/);
    const endless = run(line('cube'), fn('loop', 'x'), ret('[=loop([local.x])]'), END, echo('[=loop(1)]'));
    expect(endless.error?.message).toMatch(/more than 64 levels deep/);
  });

  it('pauses at a breakpoint inside a function with the call stack and its locals', () => {
    const result = runWith(
      { breakpoints: { lines: new Set([3]), pauseAt: 2 } },
      fn('step', 'i'),
      line('variable', { name: 'local.h', value: '[=[local.i] * 0.2]' }),
      line('cube', { size: '1, 1, [local.h]' }),
      END,
      line('repeat', { variable: 'n', from: '1', to: '3' }),
      line('call', { name: 'step', values: '[n]' }),
      END,
    );
    expect(result.error).toBeNull();
    expect(result.paused).toEqual({ line: 3, steps: 1 });
    expect(result.stack).toEqual([
      {
        name: 'step()',
        line: 6,
        locals: [
          { name: 'local.i', value: '2', type: 'Whole Number', items: [] },
          { name: 'local.h', value: '0.4', type: 'Number', items: [] },
        ],
      },
    ]);
  });
});

describe('Vector inputs', () => {
  const size = (values: Record<string, string> = {}) =>
    line('input', { name: 'size', type: 'vector', default: '1, 2, 3', ...values });

  it('give the variable a vector with an x, y and z, from the inspector or the Default', () => {
    const fallback = run(size(), echo('[size.y]'), line('cube', { size: '[size]' }));
    expect(fallback.error).toBeNull();
    expect(fallback.messages).toEqual(['2']);
    const given = runWith({ inputs: { size: '4, 5, 6' } }, size(), echo('[size.x] [size.z]'));
    expect(given.messages).toEqual(['4 6']);
  });

  it('stop on a value that is not three numbers, or a part outside Minimum and Maximum', () => {
    expect(runWith({ inputs: { size: '4, 5' } }, size()).error?.message).toContain('three numbers');
    expect(runWith({ inputs: { size: '1, 9, 1' } }, size({ max: '5' })).error?.message).toContain('from any to 5');
  });
});

describe('Inspector event handlers', () => {
  const lines = [
    line('input', { name: 'steps', type: 'count', default: '8', min: '1', max: '64' }),
    line('input', { name: 'height', type: 'number', default: '2' }),
    line('input', { name: 'reset', type: 'button', default: '' }),
    line(SOLID_SCRIPT_HANDLERS.input, { name: 'steps' }),
    line('if', { condition: '[steps] > [height] * 8' }),
    line('set_input', { name: 'steps', value: '[=floor([height] * 8)]' }),
    line('show_message', { text: 'At most [=floor([height] * 8)] steps for [height] m' }),
    END,
    END,
    line(SOLID_SCRIPT_HANDLERS.button, { name: 'reset' }),
    line('set_input', { name: 'steps', value: '8' }),
    line('set_input', { name: 'height', value: '2' }),
    END,
    line('cube'),
  ];
  const program = solidScriptDocumentCreate(lines);

  it('check and clamp a changed input without running the script', () => {
    const clamped = solidScriptProgramHandle(program, { kind: 'input', name: 'steps' }, { steps: '99', height: '2' });
    expect(clamped).toEqual({
      inputs: { steps: '16' },
      removed: [],
      notices: ['At most 16 steps for 2 m'],
      messages: [],
      error: null,
    });
    const fine = solidScriptProgramHandle(program, { kind: 'input', name: 'steps' }, { steps: '4', height: '2' });
    expect(fine).toEqual({ inputs: {}, removed: [], notices: [], messages: [], error: null });
    const other = solidScriptProgramHandle(program, { kind: 'input', name: 'height' }, { steps: '99', height: '2' });
    expect(other.inputs).toEqual({});
  });

  it('answer a button and leave the generation run untouched', () => {
    const pressed = solidScriptProgramHandle(program, { kind: 'button', name: 'reset' }, { steps: '3', height: '5' });
    expect(pressed.inputs).toEqual({ steps: '8', height: '2' });
    const generated = solidScriptProgramRun(program, { inputs: { steps: '3' } });
    expect(generated.error).toBeNull();
    expect(generated.shapes).toHaveLength(1);
  });

  it('stop when a handler builds, and on Set Input or Show Message outside one', () => {
    const building = solidScriptProgramHandle(
      solidScriptDocumentCreate([
        line('input', { name: 'w', type: 'number', default: '1' }),
        line(SOLID_SCRIPT_HANDLERS.input, { name: 'w' }),
        line('cube'),
        END,
      ]),
      { kind: 'input', name: 'w' },
      {},
    );
    expect(building.error?.message).toMatch(/only check and change inputs/);
    const set = run(line('input', { name: 'w', type: 'number', default: '1' }), line('set_input', { name: 'w' }));
    expect(set.error?.message).toMatch(/Set Input only works in When Input Changes or When Button Pressed/);
    const show = run(line('cube'), line('show_message'));
    expect(show.error?.message).toMatch(/use Echo here/);
    const unknown = solidScriptProgramHandle(
      solidScriptDocumentCreate([
        line(SOLID_SCRIPT_HANDLERS.button, { name: 'go' }),
        line('set_input', { name: 'nope' }),
        END,
      ]),
      { kind: 'button', name: 'go' },
      {},
    );
    expect(unknown.error?.message).toMatch(/there is no input "nope"/);
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
