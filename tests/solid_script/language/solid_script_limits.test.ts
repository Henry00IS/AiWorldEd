import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_LIMITS, solidScriptLimitCount } from '@/solid_script/language/solid_script_limits.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const END: SolidScriptLine = { command: 'end' };

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
 * The shown stop text of a run.
 *
 * @param result Run result.
 * @returns Text.
 */
function text(result: ReturnType<typeof run>): string {
  return result.error?.text ?? '';
}

describe('SolidScript limits', { timeout: 60_000 }, () => {
  it('keeps at least ten times the headroom of the largest official example', () => {
    expect(SOLID_SCRIPT_LIMITS.brushes).toBeGreaterThanOrEqual(3070);
    expect(SOLID_SCRIPT_LIMITS.meshTriangles).toBeGreaterThanOrEqual(2880);
    expect(SOLID_SCRIPT_LIMITS.listItems).toBeGreaterThanOrEqual(1280);
    expect(SOLID_SCRIPT_LIMITS.callDepth).toBeGreaterThanOrEqual(256);
    expect(SOLID_SCRIPT_LIMITS.work).toBeGreaterThanOrEqual(71_800);
    expect(SOLID_SCRIPT_LIMITS.repeatRounds).toBe(10_000);
  });

  it('stops when a run makes more than 10,000 solids, and names the line and the fix', () => {
    const result = run(
      { command: 'repeat', values: { variable: 'I', from: '1', to: '5002' } },
      { command: 'cube' },
      { command: 'cube' },
      END,
    );
    expect(text(result)).toMatch(
      new RegExp(
        `^Line \\d+: this line made more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.brushes)} solids\\. Change the Count, or split this into smaller generators\\.$`,
      ),
    );
  });

  it('stops when a mesh has more than 1,000,000 triangles, and names the line and the fix', () => {
    const result = run(
      { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '256', rows: '256' } },
      { command: 'select_objects' },
      { command: 'subdivide', values: { levels: '2', smooth: 'false' } },
    );
    expect(text(result)).toMatch(
      new RegExp(
        `^Line \\d+: this line made a mesh with more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.meshTriangles)} triangles\\. Use fewer Columns, Rows or Levels, or split this into smaller generators\\.$`,
      ),
    );
  });

  it('stops when a list has more than 100,000 items, and names the line and the fix', () => {
    const result = run(
      { command: 'path', values: { count: '10000', into: 'A' } },
      {
        command: 'variable',
        values: {
          name: 'List',
          value:
            '[=Concat([A.Points], [A.Points], [A.Points], [A.Points], [A.Points], [A.Points], [A.Points], [A.Points], [A.Points], [A.Points], [A.Points])]',
        },
      },
    );
    expect(text(result)).toMatch(
      new RegExp(
        `^Line \\d+: this line made a list with more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.listItems)} items\\. Change the Count, or split the list into smaller pieces\\.$`,
      ),
    );
  });

  it('stops when functions run more than 256 levels deep, and names the line and the fix', () => {
    const result = run(
      { command: 'function', values: { name: 'Loop', parameters: 'X' } },
      { command: 'return', values: { value: '[=Loop([local.X])]' } },
      END,
      { command: 'echo', values: { value: '[=Loop(1)]' } },
    );
    expect(text(result)).toMatch(
      /Line \d+: (?:Value: )?this line ran functions or parts more than 256 levels deep\. A function or part that uses itself needs an If that stops it\./,
    );
  });

  it('reuses the runaway-loop work cap and names the line and the fix', () => {
    const result = run(
      { command: 'repeat', values: { variable: 'I', from: '0', to: '10000' } },
      { command: 'repeat', values: { variable: 'J', from: '0', to: '10000' } },
      { command: 'if', values: { condition: '[I] < 0' } },
      { command: 'cube' },
      END,
      END,
      END,
    );
    expect(text(result)).toMatch(
      new RegExp(
        `^Line \\d+: the script stopped after ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.work)} steps of work\\. Check Repeat ranges, or split this into smaller generators\\.$`,
      ),
    );
  });

  it('reuses the Repeat rounds cap and names the line and the fix', () => {
    const result = run(
      { command: 'repeat', values: { variable: 'I', from: '0', to: '10001' } },
      { command: 'cube' },
      END,
    );
    expect(text(result)).toMatch(
      new RegExp(
        `^Line \\d+: Repeat would run ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.repeatRounds + 1)} times, more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.repeatRounds)}\\. Change To, or split this into smaller generators\\.$`,
      ),
    );
  });

  it('reuses the For Each items cap and names the line and the fix', () => {
    const result = run(
      { command: 'path', values: { count: '10000', into: 'Items' } },
      {
        command: 'variable',
        values: { name: 'Items', value: '[=Concat([Items.Points], Slice([Items.Points], 0, 1))]' },
      },
      { command: 'for_each', values: { list: '[Items]', variable: 'Item' } },
      END,
    );
    expect(text(result)).toMatch(
      new RegExp(
        `^Line \\d+: For Each would run ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.repeatRounds + 1)} times, more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.repeatRounds)}\\. Give it a shorter list, or split this into smaller generators\\.$`,
      ),
    );
  });
});
