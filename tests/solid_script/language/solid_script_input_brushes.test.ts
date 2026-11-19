import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptUseFaceTexture, SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

/** Corners of a box of a size, centered on a point. */
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

/** Face textures of a received box, one name per side. */
function textured(size: [number, number, number]): SolidScriptUseFaceTexture[] {
  return (['x', 'y', 'z'] as const).flatMap((axis, index) =>
    [-1, 1].map((sign) => {
      const normal: [number, number, number] = [0, 0, 0];
      normal[index] = sign;
      return {
        point: normal.map((value, at) => (value * size[at]!) / 2) as [number, number, number],
        normal,
        texture: `${sign < 0 ? 'Low' : 'High'} ${axis}`,
      };
    }),
  );
}

describe('SolidScript input brushes', () => {
  it('counts Input Brushes as output, also as a generator', () => {
    const document = solidScriptDocumentCreate([line('input_brushes')]);
    expect(solidScriptProgramRun(document, {}).error).toBeNull();
    expect(run([line('input_brushes')], undefined).error).toBeNull();
  });

  it('gives Box.Extents, Input.Extents and the received brushes as a list', () => {
    const result = run([
      line('echo', { value: '[$Box.Extents]' }),
      line('echo', { value: '[$Input.Extents]' }),
      line('echo', { value: '[$Input.Brushes]' }),
      line('echo', { value: '[$Input.Brushes.Count]' }),
      line('input_brushes'),
    ]);
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages.slice(0, 2)).toEqual(['[1, 2, 3]', '[3.25, 1, 1]']);
    expect(result.messages[2]).toContain('Input 2');
    expect(result.messages[3]).toBe('2');
  });

  it('picks faces of received brushes without outputting them, by value or Name', () => {
    const result = run([
      line('select_faces', { which: 'All', of: '[$Input.Brushes]', into: 'All' }),
      line('select_faces', { which: 'All', of: 'Input 2' }),
      line('echo', { value: '[All.Count], [$Selected.Faces.Count]' }),
    ]);
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['12, 6']);
    expect(result.shapes).toEqual([]);
  });

  it('loops over brushes with For Each and reads their members', () => {
    const result = run([
      line('for_each', { variable: 'Brush', list: '[$Input.Brushes]', key: 'I' }),
      line('echo', { value: '[I] [Brush.Name] [Brush.Center] [Brush.Size] [Brush.Extents]' }),
      line('select_faces', { which: 'All', of: '[Brush]' }),
      line('for_each', { variable: 'Corner', list: '[$Selected.Faces.Vertices]' }),
      line('add_item', { value: '[Corner.Position]', list: 'Corners' }),
      line('end'),
      line('end'),
      line('echo', { value: '[=Len([Corners])]' }),
    ]);
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual([
      '0 Input 1 [0, 0, 0] [2, 2, 2] [1, 1, 1]',
      '1 Input 2 [5, 0, 0] [1, 1, 1] [0.5, 0.5, 0.5]',
      '16',
    ]);
  });

  it('cuts received brushes like any brush and keeps their face textures, moved along', () => {
    const use: SolidScriptUseFacts = {
      usage: 'Modifier',
      solids: [box([2, 2, 2])],
      faces: 6,
      textures: [textured([2, 2, 2])],
    };
    const result = run(
      [
        line('difference'),
        line('translate', { v: '10, 0, 0' }),
        line('input_brushes'),
        line('end'),
        line('cube', { size: '1, 3, 1', anchor: 'Center, Center, Center' }),
        line('end'),
      ],
      use,
    );
    expect(result.error?.message ?? null).toBeNull();
    const cut = result.shapes[0]!;
    expect(cut.kind === 'boolean' && cut.operation).toBe('difference');
    const kept = cut.kind === 'boolean' ? cut.children[0]! : cut;
    expect(kept.kind).toBe('solid');
    const faces = kept.kind === 'solid' ? (kept.faceTextures ?? []) : [];
    expect(faces).toHaveLength(6);
    const right = faces.find((face) => face.texture === 'High x')!;
    expect(right.point.toArray()).toEqual([11, 0, 0]);
    expect(right.normal.toArray()).toEqual([1, 0, 0]);
  });

  it('builds Push Out Faces: every face of every received brush as a slab pushed outwards', () => {
    const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === 'pushOutFaces')!;
    expect(example.uses).toEqual({ generator: false, modifier: true });
    expect(example.lines.some((entry) => entry.command === 'input_brushes')).toBe(false);
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

  it('outputs the clipped received brush when Clip runs on $Input.Brushes first', () => {
    const cube: SolidScriptUseFacts = { usage: 'Modifier', solids: [box([2, 2, 2])], faces: 6 };
    const result = run(
      [line('clip', { through: '0, 0, 0', normal: '0, 1, 0', of: '[$Input.Brushes]' }), line('input_brushes')],
      cube,
    );
    expect(result.error?.message ?? null).toBeNull();
    const solids = result.shapes.flatMap(solidScriptShapeLeavesPositive);
    expect(solids).toHaveLength(1);
    const points = solids[0] && solids[0].kind === 'solid' ? solids[0].points : [];
    expect(points.length).toBeGreaterThan(0);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(0);
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(-1);
  });
});
