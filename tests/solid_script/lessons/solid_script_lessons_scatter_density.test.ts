import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptParameterApplies } from '@/solid_script/commands/solid_script_command_parameters.js';
import { SOLID_SCRIPT_COMMAND_SCATTER } from '@/solid_script/commands/solid_script_commands_scatter.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Scatters on a cube and gives the points, or the error.
 *
 * @param size Cube size.
 * @param values Scatter fields.
 * @param which Faces to pick first.
 * @returns Points, or the error message.
 */
function scatter(size: string, values: Record<string, string>, which = 'Facing Up'): number[][] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size, anchor: 'Center, Center, Center' } },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which } },
      { command: 'scatter_points', values: { into: 'Spots', ...values } },
      { command: 'for_each', values: { variable: 'Spot', list: '[Spots]' } },
      { command: 'echo', values: { value: '[Spot]' } },
      END,
    ]),
  );
  if (result.error) return result.error.message;
  return result.messages.map((message) => message.replace(/[[\]]/g, '').split(', ').map(Number));
}

/**
 * Number of points a scatter gives, failing on an error.
 *
 * @param size Cube size.
 * @param values Scatter fields.
 * @param which Faces to pick first.
 * @returns Count.
 */
function count(size: string, values: Record<string, string>, which?: string): number {
  const points = scatter(size, values, which);
  if (typeof points === 'string') throw new Error(points);
  return points.length;
}

describe('Scatter Points By Density', () => {
  it('gives points per square metre, so a bigger face gets more', () => {
    expect(count('2, 2, 2', { by: 'Density', density: '10' })).toBeGreaterThanOrEqual(38);
    expect(count('2, 2, 2', { by: 'Density', density: '10' })).toBeLessThanOrEqual(42);
    expect(count('4, 2, 4', { by: 'Density', density: '10' })).toBeGreaterThanOrEqual(155);
    expect(count('4, 2, 4', { by: 'Density', density: '10' })).toBeLessThanOrEqual(165);
  });

  it('works Density out per face with [$Face]', () => {
    const density = '[=Max(0, [$Face.Normal].Y) * 25]';
    const points = scatter('2, 2, 2', { by: 'Density', density }, 'All');
    if (typeof points === 'string') throw new Error(points);
    expect(points.length).toBeGreaterThanOrEqual(98);
    expect(points.length).toBeLessThanOrEqual(102);
    expect(points.every((point) => Math.abs((point[1] ?? 0) - 1) < 1e-6)).toBe(true);
  });

  it('fills a volume by points per cubic metre Inside', () => {
    expect(count('2, 2, 2', { on: 'Inside', by: 'Density', density: '5' }, 'All')).toBe(40);
  });

  it('stops when Density gives more than 10000 points', () => {
    expect(scatter('20, 1, 20', { by: 'Density', density: '100' })).toContain('more than 10000');
  });
});

describe('Scatter Points Spacing', () => {
  it('keeps points at least Spacing apart and gives as many as fit', () => {
    const points = scatter('2, 2, 2', { count: '500', spacing: '0.5' });
    if (typeof points === 'string') throw new Error(points);
    expect(points.length).toBeGreaterThan(5);
    expect(points.length).toBeLessThan(40);
    for (const [index, point] of points.entries())
      for (const other of points.slice(index + 1))
        expect(Math.hypot(...point.map((value, axis) => value - (other[axis] ?? 0)))).toBeGreaterThanOrEqual(0.5);
  });

  it('gives the full Count when the points fit, and the same points as before with Spacing 0', () => {
    expect(count('2, 2, 2', { count: '10', spacing: '0.05' })).toBe(10);
    expect(scatter('2, 2, 2', { count: '5', spacing: '0' })).toEqual(scatter('2, 2, 2', { count: '5' }));
  });

  it('stops on a Spacing below 0', () => {
    expect(scatter('2, 2, 2', { spacing: '-1' })).toContain('Spacing needs');
  });
});

describe('Scatter Points fields', () => {
  it('shows Count or Density by By, and hides both on a Grid', () => {
    const shown = (values: Record<string, string>): string[] =>
      SOLID_SCRIPT_COMMAND_SCATTER.parameters
        .filter((parameter) => solidScriptParameterApplies(parameter, values, SOLID_SCRIPT_COMMAND_SCATTER.parameters))
        .map((parameter) => parameter.key);
    expect(shown({})).toEqual(expect.arrayContaining(['count', 'by', 'spacing']));
    expect(shown({})).not.toContain('density');
    expect(shown({ by: 'Density' })).toContain('density');
    expect(shown({ by: 'Density' })).not.toContain('count');
    expect(shown({ on: 'Grid', by: 'Density' })).not.toContain('density');
    expect(shown({ on: 'Grid' })).not.toContain('count');
  });
});
