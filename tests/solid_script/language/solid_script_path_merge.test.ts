import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptPathSample, solidScriptPathStraight } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_KINDS } from '@/solid_script/language/solid_script_kinds.js';

const END: SolidScriptLine = { command: 'end' };
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Runs lines and counts the solids they build.
 *
 * @param lines Lines.
 * @returns Messages, solids and the error text.
 */
function run(...lines: SolidScriptLine[]) {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  const solids = result.shapes.flatMap(solidScriptShapeLeavesPositive).filter((leaf) => leaf.kind === 'solid');
  return {
    messages: result.messages,
    solids: solids.length,
    meshes: solidScriptShapeMeshes(result.shapes).length,
    error: result.error?.message ?? '',
  };
}

const CLOSED_ARC = line('path', { shape: 'Arc', radius: '1', sweep: '360', count: '12', closed: 'Yes', into: 'Ring' });
const TRIANGLE = line('path', {
  shape: 'From Points',
  points: '[0.5, 0, 0], [2, 0, 0], [1, 1, 0]',
  closed: 'Yes',
  into: 'Tri',
});

describe('one Path kind for lines and flat shapes', () => {
  it('samples a path through one function, every segment straight for now', () => {
    const open = solidScriptPathStraight([1, 2, 3], false);
    expect(open.segments).toEqual([{ kind: 'line' }, { kind: 'line' }]);
    expect(solidScriptPathSample(open)).toEqual([1, 2, 3]);
    const closed = solidScriptPathStraight([1, 2, 3], true);
    expect(closed.segments).toHaveLength(3);
    expect(solidScriptPathSample(closed)).toEqual([1, 2, 3]);
  });

  it('names Path a kind, and drops the separate outline kind', () => {
    expect(SOLID_SCRIPT_KINDS).toContain('Path');
    expect(SOLID_SCRIPT_KINDS).not.toContain('Outline' as never);
  });

  it('makes Square, Circle and Polygon a closed Path, and a Path line a Path', () => {
    const result = run(
      line('linear_extrude'),
      line('square', { size: '1, 1', into: 'S' }),
      END,
      line('path', { into: 'P' }),
      line('echo', { value: '[=IsPath([S])], [S.Closed], [=IsPath([P])], [P.Closed], [=Len([P.Points])]' }),
    );
    expect(result.error).toBe('');
    expect(result.messages).toEqual(['Yes, Yes, Yes, No, 8']);
  });

  it('fills a closed Path Arc and a closed From Points path in Linear Extrude, Rotate Extrude and Offset', () => {
    expect(run(line('linear_extrude'), CLOSED_ARC, END).solids).toBeGreaterThan(0);
    expect(run(line('rotate_extrude', { sides: '8' }), TRIANGLE, END).solids).toBe(8);
    const grown = run(line('linear_extrude'), line('offset', { distance: '0.1' }), TRIANGLE, END, END);
    expect(grown.error).toBe('');
    expect(grown.solids).toBeGreaterThan(0);
  });

  it('leaves an open Path inside Linear Extrude unfilled, with a plain message', () => {
    expect(run(line('linear_extrude'), line('path', { into: 'P' }), END).error).toMatch(/open.*Closed/i);
  });

  it('sweeps any Path with Sweep Along Path, taking whether it is closed from the Path', () => {
    expect(solidScriptCommandFind('curve_to_mesh')).toBeUndefined();
    const sweep = solidScriptCommandFind('sweep_along_path');
    expect(sweep?.label).toBe('Sweep Along Path');
    expect(sweep?.parameters.map((field) => field.key)).not.toContain('closed');
    const open = run(line('path', { count: '5', into: 'P' }), line('sweep_along_path', { path: '[P]' }));
    expect(open.error).toBe('');
    expect(open.solids).toBe(4);
    const loop = run(TRIANGLE, line('sweep_along_path', { path: '[Tri]' }));
    expect(loop.solids).toBe(3);
    const square = run(
      line('linear_extrude'),
      line('square', { into: 'S' }),
      END,
      line('sweep_along_path', { path: '[S]', mesh: 'Yes' }),
    );
    expect(square.error).toBe('');
    expect(square.meshes).toBe(1);
  });

  it('reads a Path where a list of points is asked for', () => {
    const result = run(line('path', { count: '4', into: 'P' }), line('echo', { value: '[=PathLength([P])]' }));
    expect(result.error).toBe('');
    expect(result.messages).toEqual(['1']);
  });

  it('keeps a Square drawn outside an extrude as a closed Path on the ground, and a full Arc without a repeated point', () => {
    const square = run(
      line('square', { size: '2, 2', into: 'S' }),
      line('echo', { value: '[=IsPath([S])], [S.Closed], [=Len([S.Points])], [S.Length]' }),
      CLOSED_ARC,
      line('echo', { value: '[=Len([Ring.Points])], [=Round(PathLength([Ring]))]' }),
    );
    expect(square.error).toBe('');
    expect(square.messages).toEqual(['Yes, Yes, 4, 8', '11, 6']);
    expect(run(line('square')).error).toMatch(/draws a closed Path/);
  });
});
