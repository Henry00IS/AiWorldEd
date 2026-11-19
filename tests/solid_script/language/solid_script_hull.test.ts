import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
}

/**
 * Messages a successful run printed.
 *
 * @param lines Lines.
 * @returns Messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = run(...lines);
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * The first solid a run built, or a failure when it built none.
 *
 * @param lines Lines.
 * @returns Solid leaf.
 */
function solidOf(...lines: SolidScriptLine[]) {
  const result = run(...lines);
  expect(result.error?.message ?? null).toBeNull();
  const solids = result.shapes.flatMap(solidScriptShapeLeavesPositive).filter((leaf) => leaf.kind === 'solid');
  expect(solids.length).toBeGreaterThan(0);
  const solid = solids[0];
  if (!solid || solid.kind !== 'solid') throw new Error('the script built no solid');
  return solid;
}

describe('SolidScript Hull', () => {
  it('wraps only a list of points without warning that the Hull is empty', () => {
    const result = run(
      line('hull', { points: '[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]', into: 'Rock' }),
      END,
      line('output', { of: '[Rock]' }),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.warnings.map((warning) => warning.text)).toEqual([]);
    expect(result.shapes).toHaveLength(1);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('wraps a list of points in one convex solid', () => {
    expect(
      printed(
        line('variable', { name: 'Corners', value: '[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]' }),
        line('hull', { points: '[Corners]', into: 'Rock' }),
        END,
        line('echo', { value: '[Rock.Faces.Count] [Rock.Size.x] [Rock.Size.y] [Rock.Size.z]' }),
      )[0]
        ?.split(' ')
        .map((part, index) => (index === 0 ? Number(part) : Number(part) > 1)),
    ).toEqual([4, true, true, true]);
  });

  it('wraps Point lines the same way a list does', () => {
    const listed = solidOf(
      line('hull', { points: '[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]', into: 'A' }),
      END,
      line('output', { of: '[A]' }),
    );
    const drawn = solidOf(
      line('hull', { into: 'B' }),
      line('point', { position: '0, 0, 0' }),
      line('point', { position: '2, 0, 0' }),
      line('point', { position: '0, 2, 0' }),
      line('point', { position: '0, 0, 2' }),
      END,
      line('output', { of: '[B]' }),
    );
    expect(listed.points.length).toBe(drawn.points.length);
    expect(listed.points.map((point) => point.toArray())).toEqual(drawn.points.map((point) => point.toArray()));
  });

  it('wraps scatter points on a whole cube, together with the cube or instead of it', () => {
    const result = run(
      line('cube', { size: '2, 2, 2', into: 'Box' }),
      line('scatter_points', { count: '16', seed: '3', of: '[Box]', into: 'Spots' }),
      line('hull', { points: '[Spots]', into: 'Rock' }),
      END,
      line('echo', { value: '[Rock.Size.x] [Spots.Count]' }),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages[0]?.startsWith('2 ') || Number(result.messages[0]?.split(' ')[0]) > 0).toBe(true);
    expect(result.messages[0]?.split(' ')[1]).toBe('16');
  });

  it('still wraps brushes the way it did, and can mix them with a point list', () => {
    expect(
      printed(
        line('hull', { label: 'Lump', into: 'L', points: '[0, 0, 0], [0, 3, 0]' }),
        line('cube', { size: '2, 2, 2' }),
        END,
        line('echo', { value: '[L.Name] [=[L.Size.y] > 2]' }),
      ),
    ).toEqual(['Lump Yes']);
  });

  it('stops in plain words when the points are too few or lie in one plane', () => {
    const few = run(line('hull', { points: '[0, 0, 0], [1, 0, 0], [0, 1, 0]' }), END);
    expect(few.error?.text ?? '').toMatch(/Line \d+: Hull needs at least 4 corners.*Points From List/i);
    const flat = run(line('hull', { points: '[0, 0, 0], [2, 0, 0], [0, 2, 0], [1, 1, 0]' }), END);
    expect(flat.error?.text ?? '').toMatch(/Line \d+: Hull needs at least 4 corners that do not all lie in one plane/i);
  });
});
