import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';

/**
 * Adds up the area of a mesh's triangles.
 *
 * @param result Program result.
 * @returns Area.
 */
function area(result: ReturnType<typeof solidScriptProgramRun>): number {
  return solidScriptShapeMeshes(result.shapes)
    .flatMap((mesh) => mesh.faces.map((face) => face.map((corner) => mesh.points[corner])))
    .reduce((sum, [a, b, c]) => (a && b && c ? sum + b.clone().sub(a).cross(c.clone().sub(a)).length() / 2 : sum), 0);
}

/**
 * A closed square path on the ground.
 *
 * @param name Variable.
 * @param from Low corner.
 * @param to High corner.
 * @returns Path line.
 */
function square(name: string, from: number, to: number): { command: string; values: Record<string, string> } {
  return {
    command: 'path',
    values: {
      shape: 'From Points',
      points: `[${from}, 0, ${from}], [${from}, 0, ${to}], [${to}, 0, ${to}], [${to}, 0, ${from}]`,
      closed: 'Yes',
      into: name,
    },
  };
}

describe('Fill Paths', () => {
  it('fills a loop of points', () => {
    const result = solidScriptProgramRun(solidScriptDocumentCreate([{ command: 'fill_paths' }]));
    expect(result.error?.message).toBeUndefined();
    expect(area(result)).toBeCloseTo(4, 9);
  });

  it('leaves a hole where one path lies inside another, and fills an island inside the hole', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        square('Outer', 0, 6),
        square('Hole', 1, 5),
        square('Island', 2, 4),
        { command: 'fill_paths', values: { paths: '[Outer], [Hole], [Island]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(area(result)).toBeCloseTo(36 - 16 + 4, 9);
  });

  it('faces the way the biggest path runs round', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        square('Outer', 0, 2),
        { command: 'fill_paths', values: { paths: '[Outer]' } },
        { command: 'select_objects' },
        { command: 'select_faces', values: { which: 'All' } },
        { command: 'echo', values: { value: '[$Selected.Faces.First.Normal]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['[0, 1, 0]']);
  });
});
