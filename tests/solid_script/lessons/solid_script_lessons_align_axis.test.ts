import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Aligns a centred box and gives its size afterwards.
 *
 * @param size Box size.
 * @param align Align To values.
 * @returns Size text, or the error.
 */
function alignedSize(size: string, align: Record<string, string>): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size, anchor: 'Center, Center, Center' } },
      { command: 'select_objects', values: {} },
      { command: 'align', values: align },
      { command: 'select_objects', values: { into: 'O' } },
      { command: 'echo', values: { value: '[O.Size]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Align To Axis and Amount', () => {
  it('points up by default and the named axis when given', () => {
    expect(alignedSize('1, 2, 1', { direction: '1, 0, 0' })).toBe('[2, 1, 1]');
    expect(alignedSize('1, 1, 2', { direction: '0, 1, 0', axis: 'Z' })).toBe('[1, 2, 1]');
    expect(alignedSize('2, 1, 1', { direction: '0, 0, 1', axis: 'X' })).toBe('[1, 1, 2]');
  });

  it('takes only the Amount share of the turn', () => {
    expect(alignedSize('1, 2, 1', { direction: '1, 0, 0', amount: '0' })).toBe('[1, 2, 1]');
    const [x, y, z] = alignedSize('1, 2, 1', { direction: '1, 0, 0', amount: '0.5' })
      .replace(/[[\]]/g, '')
      .split(',')
      .map(Number);
    expect(x).toBeCloseTo(3 / Math.SQRT2, 6);
    expect(y).toBeCloseTo(3 / Math.SQRT2, 6);
    expect(z).toBeCloseTo(1, 6);
  });
});
