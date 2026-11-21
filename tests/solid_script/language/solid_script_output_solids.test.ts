import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptOutputLine,
  solidScriptOutputSolids,
  solidScriptOutputTime,
  type SolidScriptOutputStats,
} from '@/solid_script/language/solid_script_output_solids.js';
import { solidScriptProgramRun, type SolidScriptProgram } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptUseSolidOf } from './solid_script_use_solid.js';

/** Time written at the end of the result line. */
const OUTPUT_TIME = /(\d+(?:\.\d+)?) ms\)$/;

/**
 * Builds a script from lines.
 *
 * @param lines Lines.
 * @returns Script.
 */
function script(...lines: SolidScriptLine[]): SolidScriptProgram {
  return solidScriptDocumentCreate(lines);
}

/**
 * Counts for a result line.
 *
 * @param solids Solids placed.
 * @param meshes Meshes placed.
 * @param processedSolids Solids created or handled.
 * @param processedMeshes Meshes created or handled.
 * @returns Counts.
 */
function stats(solids: number, meshes = 0, processedSolids = solids, processedMeshes = meshes): SolidScriptOutputStats {
  return { solids, meshes, processedSolids, processedMeshes };
}

/**
 * Corners of a box of a size, centred on a point.
 *
 * @param size Width, height and depth.
 * @param at Centre.
 * @returns Corners.
 */
function box(size: [number, number, number], at: [number, number, number] = [0, 0, 0]): [number, number, number][] {
  const corners: [number, number, number][] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        corners.push([at[0] + (x * size[0]) / 2, at[1] + (y * size[1]) / 2, at[2] + (z * size[2]) / 2]);
  return corners;
}

/**
 * A modifier receiving a number of unit cubes.
 *
 * @param count How many cubes.
 * @returns Use facts.
 */
function received(count: number): SolidScriptUseFacts {
  const solids = Array.from({ length: count }, (_, index) => solidScriptUseSolidOf(box([1, 1, 1], [index * 2, 0, 0])));
  return { usage: 'Modifier', solids, faces: count * 6 };
}

/**
 * Henry's mesh-from-received-brushes script: Input Objects inside Mesh From
 * Brushes, with the mesh kept in a variable and then placed.
 *
 * @returns Lines.
 */
function meshFromInput(): SolidScriptLine[] {
  return [
    { command: 'mesh_from_solids', values: { into: 'Mesh' } },
    { command: 'input_objects' },
    { command: 'end' },
    { command: 'output', values: { of: '[Mesh]' } },
  ];
}

/**
 * A Repeat that does cheap work many times, for a slower run.
 *
 * @param rounds Exclusive To of the Repeat.
 * @returns Script.
 */
function heavyScript(rounds: number): SolidScriptProgram {
  return script(
    { command: 'variable', values: { name: 'n', value: '0' } },
    { command: 'repeat', values: { variable: 'i', from: '0', to: String(rounds), step: '1' } },
    { command: 'variable', values: { name: 'n', value: '[=[n] + 1]' } },
    { command: 'end' },
  );
}

/**
 * Median of numbers, to settle timer noise.
 *
 * @param values Samples.
 * @returns Median.
 */
function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const mid = ordered[middle];
  if (mid === undefined) throw new Error('Expected samples');
  return mid;
}

/**
 * Runs a script several times and returns the median reported time.
 *
 * @param program Script.
 * @param rounds How many runs, after one warmup run.
 * @returns Median milliseconds.
 */
function medianMs(program: SolidScriptProgram, rounds = 5): number {
  solidScriptProgramRun(program);
  const times: number[] = [];
  for (let index = 0; index < rounds; index++) times.push(solidScriptProgramRun(program).ms);
  return median(times);
}

/**
 * Reads the milliseconds written at the end of a result line.
 *
 * @param text Output text.
 * @returns Parsed milliseconds.
 */
function outputMs(text: string): number {
  const match = OUTPUT_TIME.exec(text);
  if (!match?.[1]) throw new Error(`Expected a timed result line, got ${text}`);
  return Number(match[1]);
}

/**
 * Spins until at least a number of milliseconds have passed.
 *
 * @param ms Minimum wait.
 */
function waitAtLeast(ms: number): void {
  const started = performance.now();
  while (performance.now() - started < ms) continue;
}

/**
 * Runs a script and returns its result line.
 *
 * @param lines Lines.
 * @param use Where it runs, and what a modifier receives.
 * @param options Extra run options, such as breakpoints.
 * @returns Result line.
 */
function lineOf(
  lines: SolidScriptLine[],
  use?: SolidScriptUseFacts,
  options: { breakpoints?: { lines: ReadonlySet<number>; pauseAt: number } } = {},
): string {
  const run = solidScriptProgramRun(script(...lines), { ...(use ? { use } : {}), ...options });
  expect(run.error?.message ?? null).toBeNull();
  return solidScriptOutputLine(run);
}

/**
 * Drops the time from a result line so counts can be checked exactly.
 *
 * @param text Result line.
 * @returns Line with the time replaced by "t ms".
 */
function countsOf(text: string): string {
  return text.replace(OUTPUT_TIME, 't ms)');
}

describe('solidScriptOutputTime', () => {
  it('writes milliseconds with no trailing zeros and a space before ms', () => {
    expect(solidScriptOutputTime(7.5)).toBe('7.5 ms');
    expect(solidScriptOutputTime(7.5)).toBe('7.5 ms');
    expect(solidScriptOutputTime(0.21825)).toBe('0.21825 ms');
    expect(solidScriptOutputTime(0)).toBe('0 ms');
    expect(solidScriptOutputTime(1.2)).toBe('1.2 ms');
    expect(solidScriptOutputTime(2)).toBe('2 ms');
    expect(solidScriptOutputTime(12345.67891)).toBe('12345.67891 ms');
    expect(solidScriptOutputTime(0.000004)).toBe('0 ms');
    expect(solidScriptOutputTime(0.000006)).toBe('0.00001 ms');
  });
});

describe('solidScriptOutputSolids', () => {
  it('writes only the solids placed when nothing extra was processed', () => {
    expect(solidScriptOutputSolids(stats(5), 0.21825)).toBe('5 solids (0.21825 ms)');
    expect(solidScriptOutputSolids(stats(1), 0)).toBe('1 solid (0 ms)');
    expect(solidScriptOutputSolids(stats(0), 1.2)).toBe('0 solids (1.2 ms)');
    expect(solidScriptOutputSolids(stats(2), 12345.67891)).toBe('2 solids (12345.67891 ms)');
    expect(solidScriptOutputSolids(stats(3), 0.000004)).toBe('3 solids (0 ms)');
    expect(solidScriptOutputSolids(stats(3), 0.000006)).toBe('3 solids (0.00001 ms)');
    expect(solidScriptOutputSolids(stats(5), 7.5)).toBe('5 solids (7.5 ms)');
  });

  it('keeps so far at a breakpoint, after what was placed', () => {
    expect(solidScriptOutputSolids(stats(5), 0.21825, true)).toBe('5 solids so far (0.21825 ms)');
    expect(solidScriptOutputSolids(stats(1), 0.5, true)).toBe('1 solid so far (0.5 ms)');
    expect(solidScriptOutputSolids(stats(0, 1, 4, 1), 7.5, true)).toBe(
      '1 mesh so far (4 solids, 1 mesh processed, 7.5 ms)',
    );
  });

  it('replaces 0 solids with the mesh count when only meshes were placed', () => {
    expect(solidScriptOutputSolids(stats(0, 1, 4, 1), 7.5)).toBe('1 mesh (4 solids, 1 mesh processed, 7.5 ms)');
    expect(solidScriptOutputSolids(stats(0, 2, 0, 2), 2)).toBe('2 meshes (2 ms)');
  });

  it('writes solids and meshes together when both were placed', () => {
    expect(solidScriptOutputSolids(stats(3, 1, 4, 1), 2)).toBe('3 solids, 1 mesh (4 solids, 1 mesh processed, 2 ms)');
    expect(solidScriptOutputSolids(stats(1, 1), 2)).toBe('1 solid, 1 mesh (2 ms)');
    expect(solidScriptOutputSolids(stats(2, 3), 1)).toBe('2 solids, 3 meshes (1 ms)');
  });

  it('writes processed counts only when they differ from what was placed', () => {
    expect(solidScriptOutputSolids(stats(0, 2, 0, 1), 2)).toBe('2 meshes (1 mesh processed, 2 ms)');
    expect(solidScriptOutputSolids(stats(0, 0, 2, 0), 0.2)).toBe('0 solids (2 solids processed, 0.2 ms)');
    expect(solidScriptOutputSolids(stats(0, 0, 0, 1), 0.2)).toBe('0 solids (1 mesh processed, 0.2 ms)');
    expect(solidScriptOutputSolids(stats(0, 0, 4, 1), 7.5)).toBe('0 solids (4 solids, 1 mesh processed, 7.5 ms)');
    expect(solidScriptOutputSolids(stats(5, 0, 5, 0), 0.2)).toBe('5 solids (0.2 ms)');
  });

  it('keeps the time of the run that produced a stored result', () => {
    const run: Pick<SolidScriptRun, 'shapes' | 'ms' | 'paused' | 'processedSolids' | 'processedMeshes'> = {
      shapes: [],
      ms: 0.21825,
      paused: null,
      processedSolids: 0,
      processedMeshes: 0,
    };
    const started = performance.now();
    waitAtLeast(2);
    expect(solidScriptOutputLine(run)).toBe('0 solids (0.21825 ms)');
    expect(performance.now() - started).toBeGreaterThan(run.ms);
  });
});

describe('solidScriptOutputLine of a run', () => {
  it('shows 0 solids for an empty run, and the cubes a script places', () => {
    expect(countsOf(lineOf([]))).toBe('0 solids (t ms)');
    expect(countsOf(lineOf([{ command: 'cube' }]))).toBe('1 solid (t ms)');
    expect(countsOf(lineOf([{ command: 'cube' }, { command: 'cube' }, { command: 'cube' }]))).toBe('3 solids (t ms)');
    const five = [
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
    ];
    expect(countsOf(lineOf(five))).toBe('5 solids (t ms)');
  });

  it('shows 1 mesh from 4 received solids, as in Input Objects inside Mesh From Solids', () => {
    expect(countsOf(lineOf(meshFromInput(), received(4)))).toBe('1 mesh (4 solids, 1 mesh processed, t ms)');
  });

  it('counts an in-memory cube used only to build a mesh', () => {
    expect(
      countsOf(
        lineOf([
          { command: 'mesh_from_solids', values: { into: 'Mesh' } },
          { command: 'cube' },
          { command: 'end' },
          { command: 'output', values: { of: '[Mesh]' } },
        ]),
      ),
    ).toBe('1 mesh (1 solid, 1 mesh processed, t ms)');
  });

  it('counts a Define Part that is never stamped as processed, not placed', () => {
    expect(
      countsOf(
        lineOf([
          { command: 'part', values: { name: 'Post' } },
          { command: 'cube' },
          { command: 'cube' },
          { command: 'end' },
        ]),
      ),
    ).toBe('0 solids (2 solids processed, t ms)');
  });

  it('shows solids and a mesh when some cubes stay in the result', () => {
    expect(
      countsOf(
        lineOf([
          { command: 'cube' },
          { command: 'cube' },
          { command: 'cube' },
          { command: 'mesh_from_solids', values: { into: 'Mesh' } },
          { command: 'cube' },
          { command: 'end' },
          { command: 'output', values: { of: '[Mesh]' } },
        ]),
      ),
    ).toBe('3 solids, 1 mesh (4 solids, 1 mesh processed, t ms)');
  });

  it('counts two stamps of one mesh as two meshes placed and one processed', () => {
    expect(
      countsOf(
        lineOf([
          { command: 'mesh_from_solids', values: { into: 'Mesh' } },
          { command: 'cube' },
          { command: 'end' },
          { command: 'output', values: { of: '[Mesh]' } },
          { command: 'output', values: { of: '[Mesh]' } },
        ]),
      ),
    ).toBe('2 meshes (1 solid, 1 mesh processed, t ms)');
  });

  it('counts received brushes that were read and never placed', () => {
    expect(
      countsOf(
        lineOf(
          [{ command: 'select_faces', values: { which: 'All', of: '[$Input.Objects]', into: 'All' } }],
          received(2),
        ),
      ),
    ).toBe('0 solids (2 solids processed, t ms)');
  });

  it('hides processed counts when Input Objects places the same solids', () => {
    expect(countsOf(lineOf([{ command: 'input_objects' }], received(4)))).toBe('4 solids (t ms)');
  });

  it('does not count received brushes a modifier never reads', () => {
    expect(countsOf(lineOf([{ command: 'cube' }], received(4)))).toBe('1 solid (t ms)');
  });

  it('counts a Linear Extrude as one solid placed and processed', () => {
    expect(countsOf(lineOf([{ command: 'linear_extrude' }, { command: 'square' }, { command: 'end' }]))).toBe(
      '1 solid (t ms)',
    );
  });

  it('does not count an in-place Subdivide as another processed mesh', () => {
    expect(
      countsOf(
        lineOf([
          { command: 'mesh_from_solids' },
          { command: 'cube' },
          { command: 'end' },
          { command: 'select_objects' },
          { command: 'subdivide', values: { levels: '1', smooth: 'No' } },
        ]),
      ),
    ).toBe('1 mesh (1 solid, 1 mesh processed, t ms)');
  });

  it('counts a Subdivide Into copy as another processed mesh', () => {
    expect(
      countsOf(
        lineOf([
          { command: 'mesh_from_solids', values: { into: 'Mesh' } },
          { command: 'cube' },
          { command: 'end' },
          { command: 'subdivide', values: { of: '[Mesh]', into: 'Fine', levels: '1', smooth: 'No' } },
          { command: 'output', values: { of: '[Fine]' } },
        ]),
      ),
    ).toBe('1 mesh (1 solid, 2 meshes processed, t ms)');
  });

  it('keeps so far at a breakpoint, with only what ran before that line', () => {
    const five = [
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
    ];
    expect(countsOf(lineOf(five, undefined, { breakpoints: { lines: new Set([3]), pauseAt: 1 } }))).toBe(
      '2 solids so far (t ms)',
    );
    expect(countsOf(lineOf(meshFromInput(), received(4), { breakpoints: { lines: new Set([4]), pauseAt: 1 } }))).toBe(
      '0 solids so far (4 solids, 1 mesh processed, t ms)',
    );
    expect(countsOf(lineOf(meshFromInput(), received(4), { breakpoints: { lines: new Set([2]), pauseAt: 1 } }))).toBe(
      '0 solids so far (t ms)',
    );
  });
});

describe('solidScriptProgramRun time', () => {
  it('times a run with no solids, a success, and a failure', () => {
    const empty = solidScriptProgramRun(script());
    expect(empty.error).toBeNull();
    expect(empty.steps).toEqual([]);
    expect(empty.ms).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(empty.ms)).toBe(true);
    expect(solidScriptOutputLine(empty)).toMatch(OUTPUT_TIME);

    const cubes = script({ command: 'cube' }, { command: 'cube' }, { command: 'cube' });
    const built = solidScriptProgramRun(cubes);
    expect(built.error).toBeNull();
    expect(built.steps).toHaveLength(3);
    expect(built.ms).toBeGreaterThan(0);
    expect(solidScriptOutputLine(built)).toMatch(/^3 solids \(\d+(?:\.\d+)? ms\)$/);

    const failed = solidScriptProgramRun(script({ command: 'cube', values: { size: '1 +' } }));
    expect(failed.error).not.toBeNull();
    expect(failed.steps).toEqual([]);
    expect(failed.processedSolids).toBe(0);
    expect(failed.processedMeshes).toBe(0);
    expect(failed.ms).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(failed.ms)).toBe(true);
  });

  it('reports a time close to an outside timer of only the script run', () => {
    const program = heavyScript(200);
    solidScriptProgramRun(program);
    const started = performance.now();
    const run = solidScriptProgramRun(program);
    const wall = performance.now() - started;
    expect(run.ms).toBeGreaterThan(0);
    expect(run.ms).toBeLessThanOrEqual(wall + 0.5);
    expect(wall - run.ms).toBeLessThan(1);
  });

  it('reports a very fast empty run and a slower heavy run', () => {
    const fast = medianMs(script());
    const slow = medianMs(heavyScript(4000));
    expect(fast).toBeGreaterThanOrEqual(0);
    expect(slow).toBeGreaterThan(fast);
    expect(slow).toBeGreaterThan(0.05);
  });

  it('adds no measurable overhead beyond two performance.now calls', () => {
    const program = script({ command: 'cube' });
    solidScriptProgramRun(program);
    const rounds = 200;
    const started = performance.now();
    let reported = 0;
    for (let index = 0; index < rounds; index++) reported += solidScriptProgramRun(program).ms;
    const wall = performance.now() - started;
    expect((wall - reported) / rounds).toBeLessThan(0.25);

    const clockStarted = performance.now();
    for (let index = 0; index < 20_000; index++) {
      const begin = performance.now();
      void (performance.now() - begin);
    }
    expect((performance.now() - clockStarted) / 20_000).toBeLessThan(0.05);
  });
});

describe('solidScriptOutputLine of a timed run', () => {
  it('parses back the same decimals the run stored, without trailing zeros', () => {
    const run = solidScriptProgramRun(script({ command: 'cube' }, { command: 'sphere' }));
    const text = solidScriptOutputLine(run);
    expect(outputMs(text)).toBe(Number(solidScriptOutputTime(run.ms).replace(' ms', '')));
  });
});
