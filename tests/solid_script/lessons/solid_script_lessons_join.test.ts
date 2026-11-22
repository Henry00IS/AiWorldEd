import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';

/** Two mesh cubes, separate objects. */
const PAIR: SolidScriptLine[] = [
  { command: 'mesh_from_solids', values: { label: 'First' } },
  { command: 'cube' },
  { command: 'end' },
  { command: 'mesh_from_solids', values: { label: 'Second' } },
  { command: 'cube' },
  { command: 'end' },
  { command: 'select_objects', values: { of: 'Second' } },
  { command: 'move_by', values: { by: '3, 0, 0' } },
  { command: 'select_objects' },
];

/** Runs the pair followed by the given lines. */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate([...PAIR, ...lines]));
}

describe('Join Meshes', () => {
  it('replaces two meshes with one, keeping the separate corners and every face', () => {
    const result = run({ command: 'join_meshes' });
    expect(result.error).toBeNull();
    const meshes = solidScriptShapeMeshes(result.shapes);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]?.points).toHaveLength(16);
    expect(meshes[0]?.faces).toHaveLength(12);
  });

  it('Where keeps meshes out of the join without changing them', () => {
    const result = run({ command: 'join_meshes', values: { where: '[=[$Index] == 0]' } });
    expect(result.error).toBeNull();
    expect(solidScriptShapeMeshes(result.shapes)).toHaveLength(2);
  });

  it('Into keeps the originals and holds only the joined copy until Output', () => {
    const result = run(
      { command: 'join_meshes', values: { into: 'Joined' } },
      { command: 'echo', values: { value: '[Joined.Faces.Count]' } },
      { command: 'output', values: { of: '[Joined]' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['12']);
    expect(solidScriptShapeMeshes(result.shapes)).toHaveLength(3);
  });
});
