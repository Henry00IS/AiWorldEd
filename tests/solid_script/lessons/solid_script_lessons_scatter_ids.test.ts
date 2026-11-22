import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Scatters points on a cube's top and reads their Ids and positions.
 *
 * @param count Points wanted.
 * @returns Printed ids and points.
 */
function scatter(count: number): { ids: string; points: string; error: string | undefined } {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size: '4', label: 'C' } },
      { command: 'select_faces', values: { which: 'Facing Up', of: 'C' } },
      { command: 'scatter_points', values: { count: String(count), into: 'P', ids: 'I' } },
      { command: 'echo', values: { value: '[I]' } },
      { command: 'echo', values: { value: '[P]' } },
    ]),
  );
  return { ids: result.messages[0] ?? '', points: result.messages[1] ?? '', error: result.error?.message };
}

describe('Scatter Points Ids', () => {
  it('gives each point its own steady id that stays when more points come', () => {
    const few = scatter(4);
    const more = scatter(8);
    expect(few.error).toBeUndefined();
    const fewIds = JSON.parse(few.ids) as number[];
    const moreIds = JSON.parse(more.ids) as number[];
    expect(fewIds).toHaveLength(4);
    expect(new Set(moreIds).size).toBe(8);
    expect(moreIds.slice(0, 4)).toEqual(fewIds);
    fewIds.forEach((id) => expect(Number.isInteger(id) && id >= 0).toBe(true));
  });
});
