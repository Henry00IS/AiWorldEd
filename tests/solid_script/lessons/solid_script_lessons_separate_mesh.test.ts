import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

const BOX: SolidScriptLine[] = [
  { command: 'mesh_from_solids' },
  { command: 'cube', values: { size: '1', anchor: 'Center, Center, Center' } },
  { command: 'end' },
  { command: 'select_objects' },
];

/**
 * Runs lines after a mesh box.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function ran(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate([...BOX, ...lines]));
}

describe('Separate Mesh', () => {
  it('cuts the faces that pass Where off into a new mesh, and the rest stay', () => {
    const result = ran(
      { command: 'separate_mesh', values: { where: '[=[$NY] > 0.9]', into: 'Lid', rest: 'Box' } },
      { command: 'move_by', values: { by: '0, 1, 0', of: '[Lid]' } },
      { command: 'echo', values: { value: '[Lid.Count] [Box.Count] [Lid(0).Faces.Count] [Box(0).Faces.Count]' } },
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['1 1 1 5']);
    const meshes = solidScriptGeometryLeaves(result.shapes);
    expect(meshes).toHaveLength(2);
    const tops = meshes.map((leaf) => Math.max(...leaf.points.map((point) => point.y)));
    expect(Math.max(...tops)).toBeCloseTo(1.5, 6);
  });

  it('keeps a mesh whole when every face goes, and stops on a solid', () => {
    expect(solidScriptGeometryLeaves(ran({ command: 'separate_mesh' }).shapes)).toHaveLength(1);
    const solid = solidScriptProgramRun(
      solidScriptDocumentCreate([{ command: 'cube' }, { command: 'select_objects' }, { command: 'separate_mesh' }]),
    );
    expect(solid.error?.message).toMatch(/Mesh From Solids/);
  });
});
