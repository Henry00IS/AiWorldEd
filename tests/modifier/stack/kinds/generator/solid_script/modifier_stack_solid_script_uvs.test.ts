import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EXAMPLE_COLUMNS } from '@/solid_script/examples/solid_script_examples_basics.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Compiles a SolidScript generator in an empty solid and returns its brushes.
 *
 * @param lines Script lines.
 * @returns Compiled brushes.
 */
function compiled(lines: readonly SolidScriptLine[]): SolidBrushInstance[] {
  const world = new THREE.Group();
  const model = new SolidModel('UV test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  const script = solidScriptDocumentCreate(lines, 'UV');
  const parameters = { ...first.parameters, script };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
  world.updateMatrixWorld(true);
  return modifierStackCompile(model.getBrushes(), model.root).instances;
}

/**
 * Rounds a number for UV comparison.
 *
 * @param value Number.
 * @returns Rounded value.
 */
function rounded(value: number): number {
  return Math.round(value * 1e4) / 1e4 + 0;
}

/**
 * Rotates a loop so it starts at its lexicographically smallest entry.
 *
 * @param values Loop values.
 * @returns Rotated loop.
 */
function cycleStart(values: readonly string[]): string[] {
  if (values.length === 0) return [];
  const start = values.reduce((best, value, index) => (value < (values[best] ?? '') ? index : best), 0);
  return [...values.slice(start), ...values.slice(0, start)];
}

/**
 * Texture coordinates of one face as a started loop of rounded UVs.
 *
 * @param brush Compiled brush.
 * @param index Face index.
 * @returns Loop key.
 */
function faceUvLoop(brush: SolidBrushInstance, index: number): string {
  const mapping = brush.getFaceSurface(index).uv;
  const face = brush.brush.faces[index];
  if (!face) return '';
  return cycleStart(
    brush.brush.getFaceVertexIndices(face).map((vertex) => {
      const point = brush.brush.vertices[vertex];
      if (!point) return '0,0';
      const uv = mapping.project(point);
      return `${rounded(uv.u)},${rounded(uv.v)}`;
    }),
  ).join(';');
}

/**
 * Texture coordinates of every face, keyed by the face's normal so a moved copy
 * can be compared with the original.
 *
 * @param brush Compiled brush.
 * @returns Chart key.
 */
function localUvChart(brush: SolidBrushInstance): string {
  const faces = brush.brush.faces.map((_, index) => {
    const normal = brush.brush.planes[index]?.normal ?? new THREE.Vector3();
    return `${rounded(normal.x)},${rounded(normal.y)},${rounded(normal.z)}:${faceUvLoop(brush, index)}`;
  });
  return faces.sort().join('|');
}

/**
 * Mean X of a brush's vertices in model space.
 *
 * @param brush Compiled brush.
 * @returns Mean X.
 */
function meanX(brush: SolidBrushInstance): number {
  const vertices = brush.brush.vertices;
  return vertices.reduce((sum, vertex) => sum + vertex.x, 0) / Math.max(vertices.length, 1);
}

describe('SolidScript generator UVs', () => {
  it('keeps UVs relative to a shape when Translate moves it', () => {
    const origin = compiled([{ command: 'cube', values: { size: '1, 1, 1' } }]);
    const moved = compiled([
      { command: 'translate', values: { v: '3, 0, -1.5' } },
      { command: 'cube', values: { size: '1, 1, 1' } },
      END,
    ]);
    expect(origin).toHaveLength(1);
    expect(moved).toHaveLength(1);
    if (!origin[0] || !moved[0]) throw new Error('Expected a cube');
    expect(localUvChart(moved[0])).toBe(localUvChart(origin[0]));
  });

  it('gives every column in the Row of Columns example the same local UVs', () => {
    const brushes = compiled(SOLID_SCRIPT_EXAMPLE_COLUMNS);
    expect(brushes).toHaveLength(5);
    expect(new Set(brushes.map(localUvChart)).size).toBe(1);
    const xs = brushes.map(meanX);
    expect(Math.min(...xs)).toBeLessThan(-1);
    expect(Math.max(...xs)).toBeGreaterThan(1);
  });

  it('keeps UVs relative to a Part copied by Repeat and Use Part', () => {
    const brushes = compiled([
      { command: 'part', values: { name: 'Block' } },
      { command: 'cube', values: { size: '1, 1, 1' } },
      END,
      { command: 'repeat', values: { variable: 'I', from: '0', to: '2' } },
      { command: 'translate', values: { v: '[=[I] * 2], 0, 0' } },
      { command: 'use_part', values: { name: 'Block' } },
      END,
      END,
    ]);
    expect(brushes).toHaveLength(3);
    expect(new Set(brushes.map(localUvChart)).size).toBe(1);
  });

  it('keeps a cube after Project UVs as a brush, with the same local UVs after a move', () => {
    const boxed = (offset: string): SolidScriptLine[] => [
      { command: 'translate', values: { v: offset } },
      { command: 'cube', values: { size: '2, 2, 2' } },
      END,
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'project_uvs', values: { mode: 'Box', size: '1', space: 'Local' } },
    ];
    const origin = compiled(boxed('0, 0, 0'));
    const moved = compiled(boxed('4, 0, 0'));
    expect(origin).toHaveLength(1);
    expect(moved).toHaveLength(1);
    if (!origin[0] || !moved[0]) throw new Error('Expected a boxed cube');
    expect(localUvChart(moved[0])).toBe(localUvChart(origin[0]));
  });

  it('carries stored Project UVs through Rotate instead of re-projecting', () => {
    const projectThenRotate = compiled([
      { command: 'rotate', values: { a: '0, 90, 0' } },
      { command: 'texture' },
      { command: 'cube', values: { size: '2, 1, 3' } },
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'project_uvs', values: { mode: 'Planar', from: 'Overhead', size: '1' } },
      END,
      END,
    ]);
    const rotateThenProject = compiled([
      { command: 'rotate', values: { a: '0, 90, 0' } },
      { command: 'cube', values: { size: '2, 1, 3' } },
      END,
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'project_uvs', values: { mode: 'Planar', from: 'Overhead', size: '1' } },
    ]);
    expect(projectThenRotate).toHaveLength(1);
    expect(rotateThenProject).toHaveLength(1);
    if (!projectThenRotate[0] || !rotateThenProject[0]) throw new Error('Expected a rotated cube');
    expect(localUvChart(projectThenRotate[0])).not.toBe(localUvChart(rotateThenProject[0]));
  });

  it('carries stored Project UVs through Repeat, Use Part and Place On Face', () => {
    const brushes = compiled([
      { command: 'part', values: { name: 'Block' } },
      { command: 'cube', values: { size: '0.4, 0.4, 0.4' } },
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'project_uvs', values: { mode: 'Box', size: '1' } },
      END,
      { command: 'cube', values: { size: '2, 2, 2' } },
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } },
      { command: 'place_on_face', values: { of: '[Face]' } },
      { command: 'use_part', values: { name: 'Block' } },
      END,
      END,
    ]);
    const placed = brushes.filter((brush) => brush.brush.vertices.length <= 8 && meanSize(brush) < 1);
    expect(placed.length).toBeGreaterThan(1);
    expect(new Set(placed.map(localUvChart)).size).toBe(1);
  });
});

/**
 * Mean edge length of a brush's bounding box, for telling a small placed copy
 * from the host cube.
 *
 * @param brush Compiled brush.
 * @returns Mean size.
 */
function meanSize(brush: SolidBrushInstance): number {
  const vertices = brush.brush.vertices;
  const min = vertices.reduce((bound, vertex) => bound.min(vertex), new THREE.Vector3(Infinity, Infinity, Infinity));
  const max = vertices.reduce((bound, vertex) => bound.max(vertex), new THREE.Vector3(-Infinity, -Infinity, -Infinity));
  return max.sub(min).length() / Math.sqrt(3);
}
