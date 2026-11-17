import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

/** Corners of a box of a size, centred on a point. */
function box(size: [number, number, number], at: [number, number, number] = [0, 0, 0]) {
  const corners: [number, number, number][] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        corners.push([at[0] + (x * size[0]) / 2, at[1] + (y * size[1]) / 2, at[2] + (z * size[2]) / 2]);
  return corners;
}

/** A modifier receiving a 2 m cube and a small box beside it. */
const USE: SolidScriptUseFacts = { usage: 'Modifier', solids: [box([2, 2, 2]), box([1, 1, 1], [5, 0, 0])], faces: 12 };

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** Runs lines as a modifier and returns the run. */
function run(lines: SolidScriptLine[], use: SolidScriptUseFacts | undefined = USE) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), { box: [2, 4, 6], ...(use ? { use } : {}) });
}

describe('SolidScript input shapes', () => {
  it('counts Input Shapes as output, like Input Brushes', () => {
    const document = solidScriptDocumentCreate([line('input_shapes')]);
    expect(solidScriptProgramRun(document, {}).error).toBeNull();
    expect(run([line('input_shapes')], undefined).error).toBeNull();
  });

  it('gives Box.Extents, Input.Extents and the received brushes as a list of shapes', () => {
    const result = run([
      line('echo', { value: '[Box.Extents]' }),
      line('echo', { value: '[Input.Extents]' }),
      line('echo', { value: '[Input.Shapes]' }),
      line('input_shapes'),
    ]);
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages.slice(0, 2)).toEqual(['[1, 2, 3]', '[3.25, 1, 1]']);
    expect(result.messages[2]).toContain('Input 2');
  });

  it('picks faces of received brushes without building a shape first, by handle or list', () => {
    const result = run([
      line('select_faces', { which: 'All', how: 'New' }),
      line('for_each_selected_face'),
      line('add_item', { value: '[Face.Index]', list: 'All' }),
      line('end'),
      line('add_item', { value: 'Input 2', list: 'Mine' }),
      line('select_faces', { which: 'All', how: 'New', of: '[Mine]' }),
      line('for_each_selected_face'),
      line('add_item', { value: '[Face.Index]', list: 'Second' }),
      line('end'),
      line('echo', { value: '[=Len([All])], [=Len([Second])]' }),
      line('input_shapes'),
    ]);
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['12, 6']);
  });

  it('loops over shapes with For Each Shape and their values', () => {
    const result = run([
      line('for_each_shape', { of: '[Input.Shapes]' }),
      line('echo', { value: '[Shape.Index] [Shape.Name] [Shape.Center] [Shape.Size] [Shape.Extents]' }),
      line('select_faces', { which: 'All', how: 'New' }),
      line('for_each_vertex', { in: 'Selected Faces' }),
      line('add_item', { value: '[Vertex.Index]', list: 'Corners' }),
      line('end'),
      line('end'),
      line('echo', { value: '[=Len([Corners])]' }),
      line('input_shapes'),
    ]);
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual([
      '0 Input 1 [0, 0, 0] [2, 2, 2] [1, 1, 1]',
      '1 Input 2 [5, 0, 0] [1, 1, 1] [0.5, 0.5, 0.5]',
      '16',
    ]);
  });

  it('builds Push Out Faces: every face of every received brush as a slab pushed outwards', () => {
    const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === 'pushOutFaces')!;
    expect(example.uses).toEqual({ generator: false, modifier: true });
    expect(example.lines.some((entry) => entry.command === 'hide_input_brushes')).toBe(true);
    const cube: SolidScriptUseFacts = { usage: 'Modifier', solids: [box([2, 2, 2])], faces: 6 };
    const result = run([...example.lines], cube);
    expect(result.error?.message ?? null).toBeNull();
    const slabs = result.shapes.flatMap(solidScriptShapeLeavesPositive);
    expect(slabs).toHaveLength(6);
    for (const slab of slabs) {
      const bounds = new THREE.Box3().setFromPoints(slab.kind === 'solid' ? slab.points : []);
      const size = bounds.getSize(new THREE.Vector3());
      const thin = (['x', 'y', 'z'] as const).find((axis) => size[axis] < 0.5)!;
      expect(size[thin]).toBeCloseTo(0.1);
      // Pushed 0.25 m out from the face at 1 m.
      expect(Math.abs(bounds.min[thin] + bounds.max[thin]) / 2).toBeCloseTo(1.3);
    }
  });
});
