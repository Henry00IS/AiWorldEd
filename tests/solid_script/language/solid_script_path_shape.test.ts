import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

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
 * Echoes a formula after some lines, or the error.
 *
 * @param lines Lines before the echo.
 * @param value Echo value.
 * @returns Message, or the error.
 */
function echo(lines: SolidScriptLine[], value: string): string {
  const result = run(...lines, { command: 'echo', values: { value } }, { command: 'cube' });
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/**
 * A Path line.
 *
 * @param command Path block id.
 * @param values Field values.
 * @returns Line.
 */
function path(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

describe('SolidScript Path', () => {
  it('writes a straight line, an arc and a spiral', () => {
    expect(echo([path('line_path', { count: '3', into: 'P' })], '[P.Points]')).toBe(
      '[[0, 0, 0], [0.5, 0, 0], [1, 0, 0]]',
    );
    expect(echo([path('arc_path', { sweep: '180', count: '3', into: 'P' })], '[P.Points]')).toBe(
      '[[1, 0, 0], [0, 0, -1], [-1, 0, 0]]',
    );
    expect(echo([path('spiral_path', { height: '2', turns: '1', count: '3', into: 'P' })], '[P.Points]')).toBe(
      '[[1, 0, 0], [-1, 1, 0], [1, 2, 0]]',
    );
  });

  it('draws a Line by direction and length with Along as its To', () => {
    const to = '[=Along(Vector(1, 0, 0), Vector(0, 2, 0), 3)]';
    expect(echo([path('line_path', { from: '1, 0, 0', to, count: '2', into: 'P' })], '[P.Points]')).toBe(
      '[[1, 0, 0], [1, 3, 0]]',
    );
  });

  it('turns a Spiral the other way, clockwise from above, with negative Turns', () => {
    const quarter = (turns: string) =>
      echo([path('spiral_path', { height: '0', turns, count: '2', into: 'P' })], '[=Last([P.Points])]');
    expect(quarter('0.25')).toBe('[0, 0, -1]');
    expect(quarter('-0.25')).toBe('[0, 0, 1]');
  });

  it('keeps Points as they are, and rounds a corner when Radius is above 0', () => {
    const corners = { points: '[0, 0, 0], [1, 0, 0], [1, 1, 0]', into: 'P' };
    expect(echo([path('path_from_points', corners)], '[P.Points]')).toBe('[[0, 0, 0], [1, 0, 0], [1, 1, 0]]');
    const rounded = echo([path('path_from_points', { ...corners, corner_radius: '0.5', sides: '2' })], '[P.Points]');
    expect(rounded.startsWith('[[0, 0, 0], [0.5, 0, 0],')).toBe(true);
    expect(rounded.endsWith(', [1, 0.5, 0], [1, 1, 0]]')).toBe(true);
    expect(rounded).toContain('[0.5, 0, 0]');
  });

  it('stops when the line has no length, the arc has no sweep, or a corner radius does not fit', () => {
    expect(echo([path('line_path', { to: '0, 0, 0', into: 'P' })], '[P.Points]')).toMatch(/From and To to stand apart/);
    expect(echo([path('arc_path', { sweep: '0', into: 'P' })], '[P.Points]')).toMatch(/Sweep other than 0/);
    expect(
      echo(
        [
          path('path_from_points', {
            points: '[0, 0, 0], [0.2, 0, 0], [0.2, 0.2, 0]',
            corner_radius: '1',
            into: 'P',
          }),
        ],
        '[P.Points]',
      ),
    ).toMatch(/smaller Radius/);
  });
});
