import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryFaces, solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptFaceCornerUvs } from '@/solid_script/language/solid_script_uvs.js';

/**
 * Runs a projected 1 x 1 x 3 box (or its mesh), then the given lines, and gives
 * the middle of each face's UVs.
 *
 * @param mesh Whether to build a mesh.
 * @param lines Lines after the projection.
 * @returns UV middle per face, rounded.
 */
function middles(mesh: boolean, ...lines: SolidScriptLine[]): number[][] {
  const box: SolidScriptLine = { command: 'cube', values: { size: '1, 1, 3', anchor: 'Left, Bottom, Back' } };
  const built: SolidScriptLine[] = mesh ? [{ command: 'mesh_from_solids' }, box, { command: 'end' }] : [box];
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      ...built,
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'project_uvs', values: { space: 'World' } },
      ...lines,
    ]),
  );
  if (result.error) throw new Error(result.error.message);
  return solidScriptGeometryFaces(solidScriptGeometryLeaves(result.shapes)).map((face) => {
    const uvs = solidScriptFaceCornerUvs(face);
    return [0, 1].map(
      (axis) => Math.round((uvs.reduce((sum, uv) => sum + (uv[axis] ?? 0), 0) / uvs.length) * 1e4) / 1e4 + 0,
    );
  });
}

describe('Transform UVs Pivot Each Face', () => {
  for (const mesh of [false, true])
    it(`turns every face's UVs about that face's own middle (${mesh ? 'mesh' : 'solid'})`, () => {
      const before = middles(mesh);
      const turned = middles(mesh, { command: 'transform_uvs', values: { rotate: '90', pivot: 'Each Face' } });
      expect(turned).toEqual(before);
      const together = middles(mesh, { command: 'transform_uvs', values: { rotate: '90', pivot: 'Center' } });
      expect(together).not.toEqual(before);
    });
});
