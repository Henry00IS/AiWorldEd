import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptMeshDocumentBuild } from '@/solid_script/output/solid_script_mesh_document.js';

/** A 1 m cube wrapped as a mesh, with its top picked. */
const MESH_TOP: SolidScriptLine[] = [
  { command: 'mesh_from_solids' },
  { command: 'cube', values: { anchor: 'Center, Center, Center' } },
  { command: 'end' },
  { command: 'select_objects' },
  { command: 'select_faces', values: { which: 'Facing Up' } },
];

/**
 * Runs lines and builds the first mesh they make into its output document.
 *
 * @param lines Lines.
 * @returns Output mesh document.
 */
function built(...lines: SolidScriptLine[]) {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message).toBeUndefined();
  const leaf = solidScriptGeometryLeaves(result.shapes).find((entry) => entry.kind === 'mesh');
  if (leaf?.kind !== 'mesh') throw new Error('no mesh');
  return solidScriptMeshDocumentBuild(leaf, new THREE.Matrix4());
}

describe('Mesh texture slots', () => {
  it('gives a mesh one slot, the default texture, when no face has its own', () => {
    const mesh = built(...MESH_TOP);
    expect(mesh.textures).toEqual([null]);
    expect(mesh.slots).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('adds a slot for each texture Texture Faces gives faces of a mesh, and points those faces at it', () => {
    const mesh = built(...MESH_TOP, { command: 'texture_faces', values: { texture: 'grass' } });
    expect(mesh.textures).toEqual([null, 'grass']);
    expect(mesh.slots.filter((slot) => slot === 1)).toHaveLength(1);
    expect(mesh.slots.filter((slot) => slot === 0)).toHaveLength(5);
  });

  it('reads a textured mesh face back through [$Face.Texture]', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        ...MESH_TOP,
        { command: 'texture_faces', values: { texture: 'grass' } },
        { command: 'for_each', values: { variable: 'F', list: '[$Selected.Faces]' } },
        { command: 'echo', values: { value: '[F.Texture]' } },
        { command: 'end' },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages.join(' ')).toContain('grass');
  });
});
