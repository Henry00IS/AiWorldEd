import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { solidScriptGeneratorPieces } from '@/solid_script/language/solid_script_generator_pieces.js';
import type { SolidScriptFaceUv } from '@/solid_script/language/solid_script_shape.js';

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Solid corner lists of shapes.
 *
 * @param shapes Shapes.
 * @returns Points per solid.
 */
function solids(shapes: readonly SolidScriptShape[]): THREE.Vector3[][] {
  return shapes.flatMap(solidScriptShapeLeavesPositive).flatMap((leaf) => (leaf.kind === 'solid' ? [leaf.points] : []));
}

/**
 * Rounded bounds of solids, as min x, y, z then max.
 *
 * @param shapes Shapes.
 * @returns Bounds.
 */
function bounds(shapes: readonly SolidScriptShape[]): number[] {
  const box = new THREE.Box3().setFromPoints(solids(shapes).flat());
  return [...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 1000) / 1000 + 0);
}

/**
 * The generator kind behind a script block.
 *
 * @param id Kind id.
 * @returns Kind.
 */
function generator(id: string): ModifierStackKindGenerator {
  const kind = modifierStackKindFind(id);
  if (!(kind instanceof ModifierStackKindGenerator)) throw new Error(`Expected generator ${id}`);
  return kind;
}

const GENERATED = [
  'cone',
  'capsule',
  'torus',
  'pipe',
  'pyramid',
  'prism',
  'rhombicuboctahedron',
  'hollowBox',
  'curvedStairs',
  'column',
  'stairs',
  'arch',
  'blastHole',
];

/**
 * Default a script generator field shows: Yes or No, or the Center spelling of
 * a stored Centre choice, otherwise the stored value.
 *
 * @param field Generator field.
 * @returns Script default.
 */
function generatorScriptDefault(field: ModifierStackField): string {
  if (field.type === 'boolean') return field.default === true ? 'Yes' : 'No';
  if (field.type === 'choice') {
    const match = (field.choices ?? []).find((choice) => choice.value === field.default);
    if (match) return match.label === match.value.replaceAll('Centre', 'Center') ? match.label : match.value;
  }
  return String(field.default);
}

describe('SolidScript generator blocks', () => {
  it('offers every box generator as a block with its own field names, labels and defaults', () => {
    for (const id of GENERATED) {
      const command = solidScriptCommandFind(id);
      expect(command?.category, id).toBe('Generators');
      const kind = generator(id);
      expect(command?.label).toBe(kind.label);
      const shaped = kind.fields.filter(
        (field) =>
          !field.group &&
          !field.hidden &&
          ['number', 'choice', 'boolean'].includes(field.type) &&
          field.key !== 'operation',
      );
      expect(command?.parameters.map((parameter) => parameter.key)).toEqual([
        'size',
        'anchor',
        'mode',
        ...shaped.map((field) => field.key),
        'label',
        'into',
      ]);
      for (const field of shaped) {
        const parameter = command?.parameters.find((entry) => entry.key === field.key);
        expect(parameter?.label).toBe(field.label);
        expect(parameter?.default).toBe(generatorScriptDefault(field));
      }
    }
  });

  it('builds the same pieces as the generator, filling a centered box of width, height and depth', () => {
    const result = run({
      command: 'cone',
      values: { size: '2, 3, 4', sides: '12', topRadius: '0.5', anchor: 'Center, Center, Center' },
    });
    expect(result.error).toBeNull();
    const [minX, minY, minZ, maxX, maxY, maxZ] = bounds(result.shapes);
    expect([minY, maxY]).toEqual([-1.5, 1.5]);
    expect(maxZ).toBeGreaterThan(1.9);
    expect(maxZ).toBeLessThanOrEqual(2);
    expect([minX, minZ]).toEqual([-maxX!, -maxZ!]);
    const pieces = generator('cone').previewPieces(
      { sides: 12, topRadius: 0.5 },
      new THREE.Box3(new THREE.Vector3(-1, -1.5, -2), new THREE.Vector3(1, 1.5, 2)),
    );
    expect(solids(result.shapes)).toEqual(pieces.map((piece) => piece.vertices));
    const points = solids(result.shapes)[0]!;
    const widthAt = (y: number) =>
      Math.max(...points.filter((point) => Math.abs(point.y - y) < 1e-6).map((point) => Math.hypot(point.x, point.z)));
    expect(widthAt(1.5) / widthAt(-1.5)).toBeCloseTo(0.5, 5);
  });

  it('puts the box corner on the origin when anchored Left, Bottom, Back, and keeps generators of many pieces', () => {
    const corner = run({ command: 'stairs', values: { size: '1, 3, 2', anchor: 'Left, Bottom, Back', count: '6' } });
    expect(corner.error).toBeNull();
    expect(bounds(corner.shapes)).toEqual([0, 0, 0, 1, 3, 2]);
    expect(solids(corner.shapes).length).toBeGreaterThan(1);
  });

  it('reads choices as plain text or variables and names the choices when one is wrong', () => {
    const chosen = run(
      { command: 'variable', values: { name: 'axis', value: 'Along X' } },
      { command: 'prism', values: { axis: '[axis]', anchor: 'Center, Center, Center' } },
    );
    expect(chosen.error).toBeNull();
    const wrong = run({ command: 'prism', values: { axis: 'w', anchor: 'Center, Center, Center' } });
    expect(wrong.error?.message).toMatch(/Axis must be one of Along Z, Along X, Upright, not/);
  });

  it('builds Sphere and Cylinder with the primitive generators, under their field names', () => {
    const sphere = run({
      command: 'sphere',
      values: { r: '1', sides: '8', rings: '4', anchor: 'Center, Center, Center' },
    });
    const kindSphere = generator('sphere').previewPieces(
      { sides: 8, rings: 4 },
      new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
    );
    expect(solids(sphere.shapes).map((points) => points.length)).toEqual(
      kindSphere.map((piece) => piece.vertices.length),
    );
    expect(bounds(sphere.shapes)).toEqual(
      bounds([{ kind: 'solid', label: '', points: kindSphere[0]!.vertices, faces: [] }]),
    );
    const cylinder = run({
      command: 'cylinder',
      values: { h: '2', r1: '1', r2: '1', sides: '10', anchor: 'Center, Center, Center' },
    });
    const kindCylinder = generator('cylinder').previewPieces(
      { sides: 10 },
      new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
    );
    expect(bounds(cylinder.shapes)).toEqual(
      bounds([{ kind: 'solid', label: '', points: kindCylinder[0]!.vertices, faces: [] }]),
    );
    expect(bounds(cylinder.shapes)[1]).toBe(-1);
    const cone = run({ command: 'cylinder', values: { h: '2', r1: '0.5', r2: '1', anchor: 'Center, Bottom, Center' } });
    const points = solids(cone.shapes).flat();
    const radiusAt = (y: number) =>
      Math.max(...points.filter((point) => Math.abs(point.y - y) < 1e-6).map((point) => Math.hypot(point.x, point.z)));
    expect(radiusAt(0)).toBeCloseTo(0.5, 5);
    expect(radiusAt(2)).toBeCloseTo(1, 5);
  });

  it.each<[string, SolidScriptLine, string, Record<string, unknown>]>([
    ['Sphere', { command: 'sphere', values: { anchor: 'Left, Bottom, Back' } }, 'sphere', { sides: 16, rings: 8 }],
    ['Cylinder', { command: 'cylinder', values: { anchor: 'Left, Bottom, Back' } }, 'cylinder', { sides: 16 }],
    [
      'Cone',
      { command: 'cylinder', values: { r2: '0.5', anchor: 'Left, Bottom, Back' } },
      'cone',
      { sides: 16, topRadius: 0.5 },
    ],
    ['Arch', { command: 'arch', values: { size: '2, 2, 2', anchor: 'Left, Bottom, Back' } }, 'arch', {}],
    ['Torus', { command: 'torus', values: { size: '2, 2, 2', anchor: 'Left, Bottom, Back' } }, 'torus', {}],
  ])('keeps the texture mapping the generator gives every face of a %s', (_, line, kind, parameters) => {
    const result = run(line);
    expect(result.error).toBeNull();
    const leaves = result.shapes.flatMap(solidScriptShapeLeavesPositive);
    const height = kind === 'cylinder' || kind === 'cone' ? 1 : 2;
    const defaults = kind === 'arch' || kind === 'torus' ? generatorDefaults(kind) : parameters;
    const pieces = solidScriptGeneratorPieces(kind, defaults, { size: [2, height, 2], min: [0, 0, 0] });
    expect(leaves).toHaveLength(pieces.length);
    leaves.forEach((leaf, index) => {
      expect(leaf.kind === 'solid' && leaf.faceUvs ? uvKeys(leaf.faceUvs) : []).toEqual(uvKeys(pieces[index]!.faceUvs));
    });
  });

  it('turns a cone wider at the top over, its texture mapping with it', () => {
    const result = run({ command: 'cylinder', values: { r1: '0.5', r2: '1', anchor: 'Left, Bottom, Back' } });
    const [leaf] = result.shapes.flatMap(solidScriptShapeLeavesPositive);
    const piece = solidScriptGeneratorPieces(
      'cone',
      { sides: 16, topRadius: 0.5 },
      { size: [2, 1, 2], min: [0, 0, 0] },
    )[0]!;
    const over = new THREE.Matrix4().makeRotationX(Math.PI).setPosition(0, 1, 2);
    expect(leaf?.kind === 'solid' && leaf.faceUvs ? uvKeys(leaf.faceUvs) : []).toEqual(
      uvKeys(
        piece.faceUvs.map((face) => ({
          point: face.point.clone().applyMatrix4(over),
          normal: face.normal.clone().transformDirection(over),
          uv: face.uv.multiplyMatrix4(over.clone().invert()),
        })),
      ),
    );
  });
});

/**
 * Generator parameters at their defaults, as a block with no fields sends them.
 *
 * @param id Generator kind.
 * @returns Parameters.
 */
function generatorDefaults(id: string): Record<string, unknown> {
  return Object.fromEntries(generator(id).fields.map((field) => [field.key, field.default]));
}

/**
 * Rounded, sorted keys of texture mappings: where each face is, how it looks
 * and the U and V rows of its mapping.
 *
 * @param faces Mappings.
 * @returns Keys.
 */
function uvKeys(faces: readonly SolidScriptFaceUv[]): string[] {
  const round = (values: number[]) => values.map((value) => Math.round(value * 1e5) / 1e5 + 0).join(',');
  return faces
    .map((face) =>
      [face.point.toArray(), face.normal.toArray(), face.uv.u.toArray(), face.uv.v.toArray()].map(round).join(' '),
    )
    .sort();
}
