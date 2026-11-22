import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramEvaluate, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptSolidTreeBuild } from '@/solid_script/language/solid_script_solid_tree.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a picked cylinder and the given lines, and gives the smooth angle of
 * each face of the first brush.
 *
 * @param lines Lines after the cylinder.
 * @returns Angle per face, undefined where flat.
 */
function smoothing(...lines: SolidScriptLine[]): (number | undefined)[] {
  const document = solidScriptDocumentCreate([
    { command: 'cylinder', values: { sides: '8' } },
    { command: 'select_objects' },
    ...lines,
  ]);
  const [node] = solidScriptSolidTreeBuild(solidScriptProgramEvaluate(document).shapes, {
    offset: new THREE.Vector3(),
    worldToParent: new THREE.Matrix4(),
    operation: SolidOperation.Additive,
    namePrefix: '',
  });
  if (node?.kind !== 'brush') throw new Error('Expected a brush');
  return node.brush.faces.map((_, index) => node.faceSmooth?.[index]);
}

describe('Shade Smooth', () => {
  it('shades every face of the picked objects smooth up to Angle', () => {
    const angles = smoothing({ command: 'shade_smooth' });
    expect(angles).toHaveLength(10);
    expect(angles.every((angle) => angle === 60)).toBe(true);
  });

  it('leaves the faces that fail Where flat, such as the caps', () => {
    const angles = smoothing({
      command: 'shade_smooth',
      values: { angle: '50', where: '[=Abs([$Face.Normal.Y]) < 0.5]' },
    });
    expect(angles.filter((angle) => angle === 50)).toHaveLength(8);
    expect(angles.filter((angle) => angle === undefined)).toHaveLength(2);
  });

  it('Angle 0 makes faces flat again', () => {
    const angles = smoothing({ command: 'shade_smooth' }, { command: 'shade_smooth', values: { angle: '0' } });
    expect(angles.every((angle) => angle === undefined)).toBe(true);
  });

  it('keeps the smoothing when the object moves afterwards', () => {
    const angles = smoothing({ command: 'shade_smooth' }, { command: 'move_by', values: { by: '3, 1, 0' } });
    expect(angles.every((angle) => angle === 60)).toBe(true);
  });

  it('stops on a mesh, which cannot be shaded smooth yet', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'mesh_from_solids' },
        { command: 'cube' },
        { command: 'end' },
        { command: 'select_objects' },
        { command: 'shade_smooth' },
      ]),
    );
    expect(result.error?.message).toContain('solids');
  });
});
