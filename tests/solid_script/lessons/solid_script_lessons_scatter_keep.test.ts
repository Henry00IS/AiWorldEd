import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Scatters a 4 by 4 grid with the given Keep and prints the points.
 *
 * @param keep Keep value.
 * @returns Printed points, or the error.
 */
function scatter(keep: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'scatter_points', values: { on: 'Grid', size: '3, 0, 3', counts: '4, 1, 4', keep, into: 'Spots' } },
      { command: 'echo', values: { value: '[Spots]' } },
      { command: 'cube' },
    ]),
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/**
 * Splits printed points into one text per point.
 *
 * @param printed Printed list of points.
 * @returns Points.
 */
function points(printed: string): string[] {
  return printed === '[]' ? [] : (printed.slice(2, -2).split('], [') ?? []);
}

describe('Scatter Points Keep', () => {
  it('keeps every point at 1 and none at 0', () => {
    expect(points(scatter('1'))).toHaveLength(16);
    expect(points(scatter('0'))).toHaveLength(0);
  });

  it('keeps a share of the points that only grows with the chance', () => {
    const half = points(scatter('0.5'));
    const most = points(scatter('0.8'));
    expect(half.length).toBeGreaterThan(2);
    expect(half.length).toBeLessThan(14);
    expect(half.every((point) => most.includes(point))).toBe(true);
  });

  it('reads a chance per point, with [$Point] the point', () => {
    const right = points(scatter('[=Min(1, Max(0, [$Point.Position.X]) * 2)]'));
    expect(right).toHaveLength(8);
  });

  it('needs a chance from 0 to 1', () => {
    expect(scatter('2')).toContain('Keep needs a chance from 0 to 1');
  });
});
