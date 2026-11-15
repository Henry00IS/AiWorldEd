import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { stackFixtureEntries } from '../../modifier_stack_fixture.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import { stackFixture, type StackFixtureStep } from '../../modifier_stack_fixture.js';
import { physicsShatterTestExpectSound, physicsShatterTestWorst } from './fracture/physics_shatter_fixtures.js';

/** A plain eight-sided column. */
const COLUMN_STEP: StackFixtureStep = { kind: 'column', parameters: { sides: '8' } };

/** Two copies of whatever comes before, side by side. */
const COLUMN_ARRAY_STEP: StackFixtureStep = { kind: 'linear', parameters: { mode: 'fixed', offsetX: 3, count: 2 } };

/** Glass shatter with a short simulation. */
const COLUMN_SHATTER_STEP: StackFixtureStep = {
  kind: 'physicsShatter',
  parameters: { crackSize: 0.2, duration: 1, impactZ: -0.5, directionZ: 1, radius: 1 },
};

/**
 * Returns the visible brushes of a compile other than the authored source.
 *
 * @param fixture Stack fixture.
 * @returns Generated brushes.
 */
function columnOutputs(fixture: ReturnType<typeof stackFixture>): SolidBrushInstance[] {
  return fixture.compile().instances.filter((brush) => brush.visible && brush.id !== fixture.source.id);
}

/**
 * Sums the model-space volume of brushes.
 *
 * @param brushes Brushes.
 * @returns Volume.
 */
function columnVolume(brushes: readonly SolidBrushInstance[]): number {
  return brushes.reduce((sum, brush) => sum + physicsShatterBrushVolume(brush.getModelSpaceBrush()), 0);
}

/**
 * Returns the shortest edge of some brushes.
 *
 * @param brushes Brushes.
 * @returns Shortest edge in metres.
 */
function columnShortestEdge(brushes: readonly SolidBrushInstance[]): number {
  return physicsShatterTestWorst(brushes.map((brush) => ({ brush: brush.getModelSpaceBrush() }))).edge;
}

/**
 * Builds a stack, shatters it and presses Simulate.
 *
 * @param steps Steps before Physics Shatter.
 * @returns What the generated input, the pieces and Simulate gave.
 */
async function columnShatter(steps: StackFixtureStep[]) {
  const reference = columnOutputs(stackFixture(steps, 2));
  const fixture = stackFixture([...steps, COLUMN_SHATTER_STEP], 2);
  const unbroken = columnOutputs(fixture);
  const settings = ModifierVolume.read(fixture.volume);
  const stepId = settings.modifiers.at(-1)?.id ?? '';
  const run = physicsShatterLastRunOf(fixture.volume.uuid, stepId);
  const statuses: string[] = [];
  const target: ModifierStackActionTarget = {
    volume: fixture.volume,
    stepId,
    commandStack: null,
    status: (text) => statuses.push(text),
  };
  await physicsShatterSimulateAction(target);
  return { fixture, reference, unbroken, run, statuses, landed: columnOutputs(fixture) };
}

describe('physics shatter of generated columns', () => {
  it('shatters the column a Column step generates, not the authored brush', async () => {
    const result = await columnShatter([COLUMN_STEP]);
    const run = result.run;
    expect(result.reference.length).toBeGreaterThan(0);
    expect(run?.inputBrushIds.length).toBe(result.reference.length);
    expect(run?.inputBrushIds).not.toContain(result.fixture.source.id);
    expect(run?.fracture.pieces.every((piece) => piece.sourceBrushId !== result.fixture.source.id)).toBe(true);
    expect(run?.fracture.pieces.length ?? 0).toBeGreaterThan(result.reference.length);
    for (const piece of run?.fracture.pieces ?? [])
      expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    const kept = (run?.fracture.pieces ?? []).reduce((sum, piece) => sum + piece.volume, 0);
    if (run) physicsShatterTestExpectSound(run.fracture, 0, columnShortestEdge(result.reference));
    expect(kept).toBeCloseTo(columnVolume(result.reference), 4);
    expect(columnVolume(result.unbroken)).toBeCloseTo(kept, 4);
    expect(result.statuses.at(-1)).toMatch(/^Simulated /);
    expect(columnVolume(result.landed)).toBeCloseTo(kept, 3);
  });

  it('shatters both copies when an Array step repeats the column first', async () => {
    const result = await columnShatter([COLUMN_STEP, COLUMN_ARRAY_STEP]);
    const run = result.run;
    expect(run?.inputBrushIds.length).toBe(result.reference.length);
    const kept = (run?.fracture.pieces ?? []).reduce((sum, piece) => sum + piece.volume, 0);
    if (run) physicsShatterTestExpectSound(run.fracture, 0, columnShortestEdge(result.reference));
    expect(kept).toBeCloseTo(columnVolume(result.reference), 4);
    const xs = (run?.fracture.pieces ?? []).map((piece) => piece.centroid.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
    for (const piece of run?.fracture.pieces ?? [])
      expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    expect(result.statuses.at(-1)).toMatch(/^Simulated /);
    expect(columnVolume(result.landed)).toBeCloseTo(kept, 3);
  });

  it.each([
    ['Column, Physics Shatter', [COLUMN_SHATTER_STEP]],
    ['Column, Array, Physics Shatter', [COLUMN_ARRAY_STEP, COLUMN_SHATTER_STEP]],
  ] as const)('works on a Column node stack: %s', async (_label, extra) => {
    const node = columnNode(extra.filter((step) => step !== COLUMN_SHATTER_STEP));
    const reference = node.made();
    const shattered = columnNode([...extra]);
    const unbroken = shattered.made();
    const stepId = ModifierVolume.read(shattered.node).modifiers.at(-1)?.id ?? '';
    const run = physicsShatterLastRunOf(shattered.node.uuid, stepId);
    expect(reference.length).toBeGreaterThan(0);
    expect(run?.inputBrushIds.length).toBe(reference.length);
    expect(run?.inputBrushIds).not.toContain(shattered.source.id);
    expect(shattered.compile().instances.find((brush) => brush.id === shattered.source.id)?.visible).toBe(true);
    for (const piece of run?.fracture.pieces ?? [])
      expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    const kept = (run?.fracture.pieces ?? []).reduce((sum, piece) => sum + piece.volume, 0);
    expect(run?.fracture.pieces.length ?? 0).toBeGreaterThan(reference.length);
    if (run) physicsShatterTestExpectSound(run.fracture, 0, columnShortestEdge(reference));
    expect(kept).toBeCloseTo(columnVolume(reference), 4);
    expect(columnVolume(unbroken)).toBeCloseTo(kept, 4);
    const statuses: string[] = [];
    await physicsShatterSimulateAction({
      volume: shattered.node,
      stepId,
      commandStack: null,
      status: (text) => statuses.push(text),
    });
    expect(statuses.at(-1)).toMatch(/^Simulated /);
    const landed = shattered.made();
    expect(columnVolume(landed)).toBeCloseTo(kept, 3);
    const moved = landed.some((brush, index) => {
      const before = unbroken[index]?.getModelSpaceBrush().vertices[0];
      const after = brush.getModelSpaceBrush().vertices[0];
      return !!before && !!after && before.distanceTo(after) > 0.05;
    });
    expect(moved).toBe(true);
  });
});

/**
 * Builds a solid with a box brush and a Column generator node, 2 m wide and 2 m
 * tall, with more steps after the column.
 *
 * @param extra Steps after the column.
 * @returns Fixture parts.
 */
function columnNode(extra: StackFixtureStep[]) {
  const world = new THREE.Group();
  const model = new SolidModel('Column shatter');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  source.position.set(6, 0, 0);
  const node = modifierGeneratorNodeCreate('column');
  node.scale.set(2, 2, 2);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [column] = settings.modifiers;
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...column!, parameters: { ...column!.parameters, sides: '8' } }, ...stackFixtureEntries(extra)],
  });
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  const made = () => compile().instances.filter((brush) => brush.visible && brush.id.startsWith(`${node.uuid}#`));
  return { node, source, compile, made };
}
