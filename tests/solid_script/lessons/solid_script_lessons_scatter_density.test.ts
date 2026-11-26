import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Scatters on a cube and gives the points, or the error.
 *
 * @param size Cube size.
 * @param values Scatter fields, with `command` naming a scatter block other
 *   than Scatter On Faces.
 * @param which Faces to pick first.
 * @returns Points, or the error message.
 */
function scatter(size: string, values: Record<string, string>, which = 'Facing Up'): number[][] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'cube', values: { size, anchor: 'Center, Center, Center' } },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which } },
      { command: values['command'] ?? 'scatter_on_faces', values: { into: 'Spots', ...values } },
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

describe('Scatter By Density', () => {
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
    expect(count('2, 2, 2', { command: 'scatter_inside', by: 'Density', density: '5' }, 'All')).toBe(40);
  });

  it('keeps every point of a lower Density when Density goes up, each triangle drawing from its own stream', () => {
    const sparse = scatter('2, 2, 2', { by: 'Density', density: '10' });
    const dense = scatter('2, 2, 2', { by: 'Density', density: '30' });
    if (typeof sparse === 'string' || typeof dense === 'string') throw new Error('scatter failed');
    const text = (point: number[]) => point.join(', ');
    const kept = new Set(dense.map(text));
    expect(sparse.length).toBeGreaterThan(20);
    expect(sparse.every((point) => kept.has(text(point)))).toBe(true);
  });

  it('stops when Density gives more than 10000 points', () => {
    expect(scatter('20, 1, 20', { by: 'Density', density: '100' })).toContain('more than 10000');
  });
});

describe('Scatter Spacing', () => {
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

describe('Scatter block fields', () => {
  it('keeps Count and Density both on the random scatters, and neither on a grid', () => {
    const keys = (id: string): string[] =>
      solidScriptCommandFind(id)?.parameters.map((parameter) => parameter.key) ?? [];
    for (const id of ['scatter_on_faces', 'scatter_inside', 'scatter_in_box'])
      expect(keys(id)).toEqual(expect.arrayContaining(['by', 'count', 'density', 'spacing', 'seed', 'keep']));
    expect(keys('scatter_in_grid')).toEqual(expect.arrayContaining(['size', 'counts', 'seed', 'keep']));
    expect(keys('scatter_in_grid')).not.toEqual(expect.arrayContaining(['count']));
    expect(keys('scatter_in_grid')).not.toContain('density');
    expect(keys('scatter_in_box')).not.toContain('of');
    expect(keys('scatter_on_faces')).toEqual(expect.arrayContaining(['where', 'of', 'normals', 'rotations']));
  });
});
