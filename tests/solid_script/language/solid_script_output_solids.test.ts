import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptOutputSolids } from '@/solid_script/language/solid_script_output_solids.js';
import { solidScriptProgramRun, type SolidScriptProgram } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptRun } from '@/solid_script/language/solid_script_machine_types.js';

/** Five decimal places, as the output writes milliseconds. */
const SOLIDS_TIME = /^\d+ solids?(?: so far)? \((\d+\.\d{5})ms\)$/;

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
 * Reads the milliseconds written after a solids count.
 *
 * @param text Output text.
 * @returns Parsed milliseconds.
 */
function outputMs(text: string): number {
  const match = SOLIDS_TIME.exec(text);
  if (!match?.[1]) throw new Error(`Expected a timed solids line, got ${text}`);
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

describe('solidScriptOutputSolids', () => {
  it('writes the count and five decimal places, as in 5 solids (0.21825ms)', () => {
    expect(solidScriptOutputSolids(5, 0.21825)).toBe('5 solids (0.21825ms)');
    expect(solidScriptOutputSolids(1, 0)).toBe('1 solid (0.00000ms)');
    expect(solidScriptOutputSolids(0, 1.2)).toBe('0 solids (1.20000ms)');
    expect(solidScriptOutputSolids(2, 12345.67891)).toBe('2 solids (12345.67891ms)');
    expect(solidScriptOutputSolids(3, 0.000004)).toBe('3 solids (0.00000ms)');
    expect(solidScriptOutputSolids(3, 0.000006)).toBe('3 solids (0.00001ms)');
    expect(solidScriptOutputSolids(5, 0.21825, true)).toBe('5 solids so far (0.21825ms)');
    expect(solidScriptOutputSolids(1, 0.5, true)).toBe('1 solid so far (0.50000ms)');
  });

  it('keeps the time of the run that produced a stored result', () => {
    const run: Pick<SolidScriptRun, 'steps' | 'ms'> = { steps: [1, 1, 1, 1, 1], ms: 0.21825 };
    const started = performance.now();
    waitAtLeast(2);
    expect(solidScriptOutputSolids(run.steps.length, run.ms)).toBe('5 solids (0.21825ms)');
    expect(performance.now() - started).toBeGreaterThan(run.ms);
  });
});

describe('solidScriptProgramRun time', () => {
  it('times a run with no solids, a success, and a failure', () => {
    const empty = solidScriptProgramRun(script());
    expect(empty.error).toBeNull();
    expect(empty.steps).toEqual([]);
    expect(empty.ms).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(empty.ms)).toBe(true);
    expect(solidScriptOutputSolids(empty.steps.length, empty.ms)).toMatch(SOLIDS_TIME);

    const cubes = script({ command: 'cube' }, { command: 'cube' }, { command: 'cube' });
    const built = solidScriptProgramRun(cubes);
    expect(built.error).toBeNull();
    expect(built.steps).toHaveLength(3);
    expect(built.ms).toBeGreaterThan(0);
    expect(solidScriptOutputSolids(built.steps.length, built.ms)).toMatch(/^3 solids \(\d+\.\d{5}ms\)$/);

    const failed = solidScriptProgramRun(script({ command: 'cube', values: { size: '1 +' } }));
    expect(failed.error).not.toBeNull();
    expect(failed.steps).toEqual([]);
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

describe('solidScriptOutputSolids of a timed run', () => {
  it('parses back the same five decimals the run stored', () => {
    const run = solidScriptProgramRun(script({ command: 'cube' }, { command: 'sphere' }));
    const text = solidScriptOutputSolids(run.steps.length, run.ms);
    expect(outputMs(text)).toBe(Number(run.ms.toFixed(5)));
  });
});
