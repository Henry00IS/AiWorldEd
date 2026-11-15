import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';

/** A loop of three cubes after a sphere; line 4 is the cube. */
const LOOP = solidScriptDocumentCreate([
  { command: 'sphere' },
  { command: 'variable', values: { name: 'width', value: '2' } },
  { command: 'repeat', values: { variable: 'i', from: '0', to: '2' } },
  { command: 'cube', values: { size: '[width], 1, 1' } },
  { command: 'end' },
]);

describe('SolidScript breakpoints', () => {
  it('records every time the run reaches a breakpoint line, with the shapes made before it', () => {
    const run = solidScriptProgramRun(LOOP, { breakpoints: { lines: new Set([4]), pauseAt: 0 } });
    expect(run.error).toBeNull();
    expect(run.paused).toBeNull();
    expect(run.breaks).toEqual([
      { line: 4, steps: 1 },
      { line: 4, steps: 2 },
      { line: 4, steps: 3 },
    ]);
    expect(run.shapes).toHaveLength(2);
  });

  it('pauses before the line runs at the chosen hit, with the variables that line sees', () => {
    const run = solidScriptProgramRun(LOOP, { breakpoints: { lines: new Set([4]), pauseAt: 2 } });
    expect(run.error).toBeNull();
    expect(run.paused).toEqual({ line: 4, steps: 2 });
    expect(run.steps).toEqual([1, 4]);
    expect(run.variables).toEqual(
      expect.arrayContaining([
        { name: 'width', value: '2' },
        { name: 'i', value: '1' },
      ]),
    );
  });

  it('pauses at a breakpoint before the first shape without calling the script empty', () => {
    const run = solidScriptProgramRun(LOOP, { breakpoints: { lines: new Set([1]), pauseAt: 1 } });
    expect(run.error).toBeNull();
    expect(run.paused).toEqual({ line: 1, steps: 0 });
    expect(run.shapes).toHaveLength(0);
  });

  it('runs to the end when the pause hit is never reached', () => {
    const run = solidScriptProgramRun(LOOP, { breakpoints: { lines: new Set([4]), pauseAt: 9 } });
    expect(run.paused).toBeNull();
    expect(run.shapes).toHaveLength(2);
  });
});
