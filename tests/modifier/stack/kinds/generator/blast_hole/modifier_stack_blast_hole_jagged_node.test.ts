import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { blastHoleRaggedShape } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_ragged.js';
import { blastHoleShape } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_outline.js';
import {
  blastHoleOutlineSettingsRead,
  blastHoleRaggedSettingsRead,
} from '@/modifier/stack/kinds/generator/modifier_stack_kind_blast_hole.js';
import {
  BLAST_HOLE_FORMAT_VERSION,
  BLAST_HOLE_FORMAT_VERSION_KEY,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_format.js';
import {
  blastHolePolygonArea,
  blastHolePolygonContains,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_quality.js';
import { blastHoleSegmentDistance } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_simple.js';

/** Box size of the Blast Hole node in the fixture wall. */
const NODE_SIZE = new THREE.Vector3(3, 2.4, 0.4);

/**
 * Builds a 6 x 4 m wall with a Blast Hole node through it.
 *
 * @param patch Blast Hole parameters.
 * @param operation Node operation.
 * @param shatter Physics Shatter parameters, or null for none.
 * @returns Fixture parts.
 */
function jaggedFixture(
  patch: Record<string, unknown> = {},
  operation = SolidOperation.Subtractive,
  shatter: Record<string, unknown> | null = null,
) {
  const world = new THREE.Group();
  const model = new SolidModel('Jagged hole');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive, null, false).mesh?.scale.set(6, 4, NODE_SIZE.z);
  const node = modifierGeneratorNodeCreate('blastHole');
  node.scale.copy(NODE_SIZE);
  model.root.add(node);
  if (operation !== SolidOperation.Additive) modifierGeneratorOperationCommand(node, operation)?.execute();
  const settings = ModifierVolume.read(node);
  const [hole, ...rest] = settings.modifiers;
  const parameters = { ...hole!.parameters, ...patch };
  const steps = [{ ...hole!, parameters }, ...rest];
  const shatterStep = shatter ? modifierStackEntryCreate('physicsShatter', steps) : null;
  if (shatterStep) shatterStep.parameters = { ...shatterStep.parameters, ...shatter };
  ModifierVolume.write(node, { ...settings, modifiers: shatterStep ? [...steps, shatterStep] : steps });
  world.updateMatrixWorld(true);
  const instances = modifierStackCompile(model.getBrushes(), model.root).instances;
  const pieces = instances.filter((brush) => brush.id.startsWith(`${node.uuid}#`));
  return { node, parameters, pieces, shatterId: shatterStep?.id ?? '' };
}

/**
 * Sums the volume of brushes.
 *
 * @param brushes Brushes.
 * @returns Volume.
 */
function volumeOf(brushes: readonly SolidBrushInstance[]): number {
  return brushes.reduce((sum, brush) => sum + physicsShatterBrushVolume(brush.getModelSpaceBrush()), 0);
}

/**
 * Lists the visible inspector rows of Blast Hole parameters.
 *
 * @param parameters Parameters set on a new modifier.
 * @returns Row labels.
 */
function rows(parameters: Record<string, unknown>): string[] {
  const kind = modifierStackKindFind('blastHole')!;
  const normalized = kind.normalizeParameters({ ...kind.createParameters(), ...parameters });
  return kind.fields
    .filter((field) => !field.hidden && (!field.visible || field.visible(normalized)))
    .map((field) => field.label);
}

describe('blast hole jagged node', () => {
  it('starts new Blast Holes on the new Jagged style at the current format', () => {
    const { parameters } = jaggedFixture();
    expect(parameters['style']).toBe('jagged');
    expect(parameters[BLAST_HOLE_FORMAT_VERSION_KEY]).toBe(BLAST_HOLE_FORMAT_VERSION);
  });

  it('loads version 1 Jagged saves as the Star style, so old scenes keep their hole', () => {
    const kind = modifierStackKindFind('blastHole')!;
    expect(kind.normalizeParameters({ seed: 4 })['style']).toBe('star');
    expect(kind.normalizeParameters({ style: 'jagged', seed: 4 })['style']).toBe('star');
    expect(kind.normalizeParameters({ style: 'bricks' })['style']).toBe('bricks');
    expect(kind.normalizeParameters({ style: 'jagged', formatVersion: 2 })['style']).toBe('jagged');
    expect(kind.normalizeParameters({ formatVersion: 9 })[BLAST_HOLE_FORMAT_VERSION_KEY]).toBe(9);
    const migrated = kind.normalizeParameters({ style: 'jagged', seed: 4 });
    expect(kind.normalizeParameters(migrated)).toEqual(migrated);
  });

  it('builds an old Jagged save with the old star outline, piece for piece', () => {
    const { parameters, pieces } = jaggedFixture({ style: 'star', seed: 6 });
    const star = blastHoleShape(blastHoleOutlineSettingsRead(parameters), NODE_SIZE.x / 2, NODE_SIZE.y / 2)!;
    expect(pieces.length).toBe(star.parts.length);
    const area = star.parts.reduce((sum, part) => sum + blastHolePolygonArea(part), 0);
    expect(volumeOf(pieces)).toBeCloseTo(area * NODE_SIZE.z, 6);
  });

  it.each([
    ['add', SolidOperation.Additive],
    ['subtract', SolidOperation.Subtractive],
    ['intersect', SolidOperation.Additive],
  ])(
    'extrudes the outline through the box in %s mode (intersect pieces are additive in an intersecting group), volume = area x depth',
    (mode, operation) => {
      const { parameters, pieces } = jaggedFixture({ seed: 3, operation: mode }, SolidOperation.Additive);
      const shape = blastHoleRaggedShape(blastHoleRaggedSettingsRead(parameters), NODE_SIZE.x / 2, NODE_SIZE.y / 2)!;
      expect(pieces.length).toBe(shape.parts.length);
      expect(new Set(pieces.map((piece) => piece.operation))).toEqual(new Set([operation]));
      expect(volumeOf(pieces)).toBeCloseTo(blastHolePolygonArea(shape.outline) * NODE_SIZE.z, 6);
    },
  );

  it('fills back the same pieces it cuts, and its shatter pieces stay inside the hole, off the rim', () => {
    const shatter = { material: 'concrete', crackSize: 0.35 };
    const { node, parameters, pieces, shatterId } = jaggedFixture({ seed: 5, fillBack: true }, undefined, shatter);
    const run = physicsShatterLastRunOf(node.uuid, shatterId)!;
    const cut = pieces.filter((piece) => piece.operation === SolidOperation.Subtractive);
    expect(run.inputBrushIds.length).toBe(cut.length);
    const outline = blastHoleRaggedShape(
      blastHoleRaggedSettingsRead(parameters),
      NODE_SIZE.x / 2,
      NODE_SIZE.y / 2,
    )!.outline;
    const outside = (point: THREE.Vector2) =>
      !blastHolePolygonContains(outline, point) &&
      Math.min(
        ...outline.map((start, index) =>
          blastHoleSegmentDistance(start, outline[(index + 1) % outline.length]!, point),
        ),
      ) > 1e-6;
    expect(run.fracture.pieces.length).toBeGreaterThan(cut.length);
    for (const piece of run.fracture.pieces)
      for (const vertex of piece.brush.vertices) expect(outside(new THREE.Vector2(vertex.x, vertex.y))).toBe(false);
  });

  it('shows each style only its own rows, most used first, each with a tooltip', () => {
    expect(rows({}).slice(0, 8)).toEqual([
      'Style',
      'Seed',
      'Shape',
      'Jag Size',
      'Roughness',
      'Bites',
      'Edge Detail',
      ...rows({}).slice(7, 8),
    ]);
    expect(rows({ style: 'bricks' }).slice(0, 6)).toEqual([
      'Style',
      'Seed',
      'Spikes',
      'Spike Length',
      'Roughness',
      'Edge Detail',
    ]);
    expect(rows({ style: 'star' }).slice(0, 6)).toEqual([
      'Style',
      'Seed',
      'Spikes',
      'Spike Length',
      'Roughness',
      'Edge Detail',
    ]);
    expect(rows({ operation: 'subtract' }).slice(0, 3)).toEqual(['Style', 'Seed', 'Fill Back']);
    expect(rows({})).not.toContain('Brick Length');
    const kind = modifierStackKindFind('blastHole')!;
    for (const field of kind.fields) {
      expect(field.hint, field.key).toBeTruthy();
      expect(field.hint?.length ?? 0, field.key).toBeLessThanOrEqual(120);
    }
    for (const choice of kind.fields.find((field) => field.key === 'style')?.choices ?? [])
      expect(choice.title, choice.value).toBeTruthy();
  });
});
