import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Runs lines a few times and returns the fastest run in milliseconds.
 *
 * @param lines Lines.
 * @returns Fastest time and the last result.
 */
function timed(lines: SolidScriptLine[]) {
  const document = solidScriptDocumentCreate(lines);
  let result = solidScriptProgramRun(document);
  let best = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 3; round++) {
    const start = performance.now();
    result = solidScriptProgramRun(document);
    best = Math.min(best, performance.now() - start);
  }
  process.stderr.write(`SolidScript speed: ${best.toFixed(0)} ms\n`);
  return { best, result };
}

describe('SolidScript speed', () => {
  it('runs a loop of a million rounds with a formula in a few seconds at most', () => {
    const { best, result } = timed([
      { command: 'variable', values: { name: 'x', value: '0' } },
      { command: 'repeat', values: { variable: 'j', from: '1', to: '1001' } },
      { command: 'repeat', values: { variable: 'i', from: '1', to: '1001' } },
      { command: 'variable', values: { name: 'x', value: '[=[x] + [i] * 2]' } },
      { command: 'end' },
      { command: 'end' },
      { command: 'echo', values: { value: '[x]' } },
      { command: 'cube' },
    ]);
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['1001000000']);
    expect(best).toBeLessThan(8000);
  }, 120000);
});
