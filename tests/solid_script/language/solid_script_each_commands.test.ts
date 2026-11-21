import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Two cubes of size 2 side by side, at X 0 and 5, named C0 and C5.
 *
 * @returns Lines that build them.
 */
function twoCubes(): SolidScriptLine[] {
  return [0, 5].flatMap((x) => [
    line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', label: `C${x}` }),
    line('move_by', { by: `${x}, 0, 0`, of: `C${x}` }),
  ]);
}

/**
 * Runs lines and returns the shapes and what they printed, or fails.
 *
 * @param lines Script lines.
 * @returns Printed lines, each read as JSON, and the shapes.
 */
function run(...lines: SolidScriptLine[]): { printed: unknown[]; shapes: SolidScriptShape[] } {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  if (result.error) throw new Error(result.error.message);
  return { printed: result.messages.map((text) => JSON.parse(text) as unknown), shapes: result.shapes };
}

/** Lines that pick the top faces of the two cubes. */
const TOPS = [line('select_brushes'), line('select_faces', { which: 'All', where: '[=[$NY] > 0.5]' })];

/**
 * Places a 1 by 2 by 3 cube at two points and returns the sizes.
 *
 * @param values Place At Points values besides At and Into.
 * @returns Sizes of the two copies.
 */
function placedSizes(values: Record<string, string>): unknown {
  return run(
    line('place_at_points', { at: '[0, 0, 0], [5, 0, 0]', into: 'Placed', ...values }),
    line('cube', { size: '1, 2, 3' }),
    line('end'),
    line('echo', { value: '[Placed.Sizes]' }),
  ).printed[0];
}

describe('SolidScript commands with per-item fields', () => {
  it('declares the per-item fields of Place, the face tools and Texture Faces', () => {
    const each = (id: string, key: string) =>
      solidScriptCommandFind(id)?.parameters.find((entry) => entry.key === key)?.each;
    for (const key of ['lift', 'directions', 'align', 'rotation', 'scale'])
      expect(each('place_at_points', key)).toBe('Point');
    expect(each('place_on_face', 'lift')).toBe('Face');
    expect(each('extrude_face', 'distance')).toBe('Face');
    expect(each('extrude_face', 'lift')).toBe('Face');
    expect(each('inset_face', 'distance')).toBe('Face');
    expect(each('scale_faces', 'factor')).toBe('Face');
    expect(each('texture_faces', 'texture')).toBe('Face');
  });

  it('lifts each Place At Points copy by its own Lift', () => {
    const centers = run(
      line('place_at_points', { at: '[0, 0, 0], [5, 0, 0]', lift: '[=[$Index] * 3]', into: 'Placed' }),
      line('cube', { size: '1, 1, 1' }),
      line('end'),
      line('echo', { value: '[Placed.Centers]' }),
    ).printed[0] as number[][];
    expect((centers[1]?.[1] ?? 0) - (centers[0]?.[1] ?? 0)).toBeCloseTo(3, 6);
  });

  it('works out Directions per point, or takes one direction for all points', () => {
    expect(placedSizes({ directions: '[=Vector([$Index], 1 - [$Index], 0)]' })).toEqual([
      [1, 2, 3],
      [2, 1, 3],
    ]);
    expect(placedSizes({ directions: '1, 0, 0' })).toEqual([
      [2, 1, 3],
      [2, 1, 3],
    ]);
  });

  it('works out Align To Normal per point', () => {
    const sizes = (align: string) => placedSizes({ directions: '1, 0, 0', align }) as number[][];
    const mixed = sizes('[=[$Index] == 1]');
    expect(mixed[0]).toEqual(sizes('No')[0]);
    expect(mixed[1]).toEqual(sizes('Yes')[1]);
    expect(mixed[0]).not.toEqual(mixed[1]);
  });

  it('lifts each Place On Face copy by its own Lift', () => {
    const centers = run(
      ...twoCubes(),
      ...TOPS,
      line('place_on_face', { lift: '[=[$Index] * 2]', into: 'Posts' }),
      line('cube', { size: '1, 1, 1' }),
      line('end'),
      line('echo', { value: '[Posts.Centers]' }),
    ).printed[0] as number[][];
    expect((centers[1]?.[1] ?? 0) - (centers[0]?.[1] ?? 0)).toBeCloseTo(2, 6);
  });

  it('pulls each face out by its own Extrude Distance and Lift', () => {
    const out = run(
      ...twoCubes(),
      ...TOPS,
      line('extrude_face', { distance: '[=1 + [$Index]]', lift: '[=[$Index] * 0.5]', into: 'Slabs' }),
      line('echo', { value: '[Slabs.Sizes]' }),
      line('echo', { value: '[Slabs.Centers]' }),
    ).printed as number[][][];
    expect(out[0]?.map((size) => size[1])).toEqual([1, 2]);
    expect(out[1]?.map((center) => center[1])).toEqual([1.5, 2.5]);
  });

  it('insets each mesh face by its own Distance', () => {
    const areas = (distance: string) =>
      run(
        line('mesh_brushes', { into: 'M' }),
        line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' }),
        line('end'),
        line('select_faces', { which: 'All', of: '[M]' }),
        line('inset_face', { distance, inner: 'Inner' }),
        line('echo', { value: '[Inner.Areas]' }),
      ).printed[0] as number[];
    expect(new Set(areas('0.25').map((area) => area.toFixed(6))).size).toBe(1);
    const varied = areas('[=0.1 + 0.1 * [$Index]]');
    expect(varied[0]).toBeCloseTo(1.8 * 1.8, 6);
    expect(varied[1]).toBeCloseTo(1.6 * 1.6, 6);
  });

  it('scales each face by its own Factor', () => {
    const sizes = run(
      ...twoCubes(),
      ...TOPS,
      line('scale_faces', { factor: '[=1 + [$Index]]' }),
      line('echo', { value: '[$Selected.Brushes.Sizes]' }),
    ).printed[0] as number[][];
    expect(sizes[0]?.[0]).toBeCloseTo(2, 6);
    expect(sizes[1]?.[0]).toBeCloseTo(4, 6);
  });

  it('gives each face its own Texture', () => {
    const { shapes } = run(
      ...twoCubes(),
      ...TOPS,
      line('texture_faces', { texture: '[=Pick([$Index], "grass", "stone")]' }),
    );
    const textures = JSON.stringify(shapes);
    expect(textures).toContain('"grass"');
    expect(textures).toContain('"stone"');
  });

  it('declares the transform tool fields as per item', () => {
    for (const id of [
      'move_by',
      'move_to',
      'rotate_by',
      'rotate_to',
      'scale_by',
      'scale_to',
      'align',
      'mirror',
      'resize',
    ]) {
      const command = solidScriptCommandFind(id);
      for (const parameter of command?.parameters ?? [])
        if (!['of', 'into'].includes(parameter.key)) expect([id, parameter.each]).toEqual([id, 'Item']);
    }
  });

  it('moves, turns and scales each brush by its own amount', () => {
    const after = (...lines: SolidScriptLine[]) =>
      run(...twoCubes(), line('select_brushes'), ...lines, line('echo', { value: '[$Selected.Brushes.Mins]' })).printed;
    const centers = (...lines: SolidScriptLine[]) =>
      run(...twoCubes(), line('select_brushes'), ...lines, line('echo', { value: '[$Selected.Brushes.Centers]' }))
        .printed[0] as number[][];
    const sizes = (...lines: SolidScriptLine[]) =>
      run(...twoCubes(), line('select_brushes'), ...lines, line('echo', { value: '[$Selected.Brushes.Sizes]' }))
        .printed[0] as number[][];
    expect(centers(line('move_by', { by: '[=Vector(0, [$Index] * 2, 0)]' })).map((c) => c[1])).toEqual([0, 2]);
    expect(centers(line('move_to', { to: '[=Vector([$Index] * 10, 0, 0)]' })).map((c) => c[0])).toEqual([0, 10]);
    expect(sizes(line('scale_by', { by: '[=1 + [$Index]]' })).map((c) => c[0])).toEqual([2, 4]);
    expect(sizes(line('scale_to', { to: '[=Vector(1 + [$Index], 1, 1)]' })).map((c) => c[0])).toEqual([1, 2]);
    const turned = sizes(line('rotate_by', { by: '[=Vector(0, 0, [$X] * 9)]' }));
    expect(turned[0]?.[0]).toBeCloseTo(2, 6);
    expect(turned[1]?.[0]).toBeCloseTo(2 * Math.SQRT2, 6);
    expect(after(line('move_by', { by: '0, 1, 0' }))).toEqual(after(line('move_by', { by: '[=Vector(0, 1, 0)]' })));
  });

  it('moves each point of a list by its own amount', () => {
    const moved = run(
      line('variable', { name: 'Spots', value: '[0, 0, 0], [0, 0, 0], [0, 0, 0]' }),
      line('move_by', { by: '[=Vector([$Index], [$Count], 0)]', of: '[Spots]', into: 'Out' }),
      line('echo', { value: '[Out]' }),
    ).printed[0];
    expect(moved).toEqual([
      [0, 3, 0],
      [1, 3, 0],
      [2, 3, 0],
    ]);
  });
});
