import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/** A mesh cube, picked. */
const MESH: SolidScriptLine[] = [
  { command: 'mesh_from_solids', values: { label: 'Box' } },
  { command: 'cube' },
  { command: 'end' },
  { command: 'select_objects' },
];

/** Runs lines. */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

describe('Delete Objects, Faces, Edges and Vertices', () => {
  it('Delete Objects takes the objects that pass Where out of the result and the selection', () => {
    const result = run(
      { command: 'cube', values: { label: 'Low' } },
      { command: 'cube', values: { label: 'High' } },
      { command: 'select_objects', values: { of: 'High' } },
      { command: 'move_by', values: { by: '0, 3, 0' } },
      { command: 'select_objects' },
      { command: 'delete_objects', values: { where: '[=[$Object.Center.Y] < 1]' } },
      { command: 'echo', values: { value: '[$Selected.Objects.Count]' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['1']);
    expect(solidScriptGeometryLeaves(result.shapes).map((leaf) => leaf.label)).toEqual(['High']);
  });

  it('Delete Faces takes only the faces that pass Where', () => {
    const result = run(...MESH, {
      command: 'delete_faces',
      values: { of: '[$Selected.Objects]', where: '[=[$NY] > 0.5]' },
    });
    expect(result.error).toBeNull();
    expect(solidScriptShapeMeshes(result.shapes)[0]?.faces).toHaveLength(5);
  });

  it('Delete Edges takes out the faces along the picked edges', () => {
    const result = run(...MESH, {
      command: 'delete_edges',
      values: { of: '[$Selected.Objects]', where: '[=[$Edge.Center.Y] > 0.4]' },
    });
    expect(result.error).toBeNull();
    expect(solidScriptShapeMeshes(result.shapes)[0]?.faces).toHaveLength(1);
  });

  it('Delete Vertices takes out the faces around a corner', () => {
    const result = run(...MESH, {
      command: 'delete_vertices',
      values: { of: '[$Selected.Objects]', where: '[=[$Y] > 0 and [$X] > 0 and [$Z] > 0]' },
    });
    expect(result.error).toBeNull();
    expect(solidScriptShapeMeshes(result.shapes)[0]?.faces).toHaveLength(3);
  });

  it('a mesh that loses every face is taken out', () => {
    const result = run(...MESH, { command: 'delete_faces', values: { of: '[$Selected.Objects]' } });
    expect(result.error).toBeNull();
    expect(solidScriptShapeMeshes(result.shapes)).toHaveLength(0);
  });

  it('stops on a solid', () => {
    const result = run(
      { command: 'cube' },
      { command: 'select_objects' },
      { command: 'delete_vertices', values: { of: '[$Selected.Objects]' } },
    );
    expect(result.error?.message ?? '').toMatch(/Mesh From Solids/);
  });
});
