import { describe, expect, it, vi } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { MODIFIER_STACK_KIND_PHYSICS_SHATTER } from '@/modifier/stack/kinds/shatter/modifier_stack_kind_physics_shatter.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import {
  physicsShatterResetAction,
  physicsShatterSimulateAction,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import { PhysicsShatterSimulation } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim.js';
import { stackFixture } from '../../../modifier_stack_fixture.js';

/**
 * Builds a shattered unit box and the action target of its modifier.
 *
 * @returns Fixture, target and the status lines the action wrote.
 */
function simulateTestFixture() {
  const fixture = stackFixture([
    { kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters: { crackSize: 0.35, strength: 6, duration: 1 } },
  ]);
  const statuses: string[] = [];
  const stepId = ModifierVolume.read(fixture.volume).modifiers[0]?.id ?? '';
  const target: ModifierStackActionTarget = {
    volume: fixture.volume,
    stepId,
    commandStack: null,
    status: (text) => statuses.push(text),
  };
  return { fixture, target, statuses, stepId };
}

/**
 * Returns the stored parameters of the fixture's modifier.
 *
 * @param target Action target.
 * @returns Parameters.
 */
function simulateTestParameters(target: ModifierStackActionTarget): Record<string, unknown> {
  return ModifierVolume.read(target.volume).modifiers.find((entry) => entry.id === target.stepId)?.parameters ?? {};
}

/**
 * Returns the vertex positions of the visible pieces.
 *
 * @param instances Compiled brushes.
 * @param sourceId Authored brush id.
 * @returns Flat vertex lists per piece.
 */
function simulatePiecePositions(instances: readonly SolidBrushInstance[], sourceId: string): number[][] {
  return instances
    .filter((instance) => instance.visible && instance.id !== sourceId)
    .map((instance) => instance.getModelSpaceBrush().vertices.flatMap((vertex) => vertex.toArray()));
}

describe('physics shatter simulate action', () => {
  it('never simulates while the stack evaluates, on any client', () => {
    const constructed = vi.spyOn(PhysicsShatterSimulation, 'movingPieceCount');
    const { fixture } = simulateTestFixture();
    fixture.compile();
    fixture.refresh();
    expect(constructed).not.toHaveBeenCalled();
    constructed.mockRestore();
  });

  it('plays the blast, stores the landing poses for the current input and moves the pieces there', async () => {
    const { fixture, target, statuses, stepId } = simulateTestFixture();
    const unbroken = simulatePiecePositions(fixture.compile().instances, fixture.source.id);
    await physicsShatterSimulateAction(target);
    const parameters = simulateTestParameters(target);
    expect(String(parameters['bake']).length).toBeGreaterThan(0);
    expect(parameters['bakeHash']).toBe(physicsShatterLastRunOf(fixture.volume.uuid, stepId)?.inputHash);
    expect(statuses.at(-1)).toMatch(/^Simulated /);
    const landed = simulatePiecePositions(fixture.compile().instances, fixture.source.id);
    expect(landed.length).toBe(unbroken.length);
    expect(landed).not.toEqual(unbroken);
    expect(physicsShatterLastRunOf(fixture.volume.uuid, stepId)?.status).toBe('baked');
  });

  it('clears the stored poses on Reset so the pieces show unbroken again', async () => {
    const { fixture, target } = simulateTestFixture();
    const unbroken = simulatePiecePositions(fixture.compile().instances, fixture.source.id);
    await physicsShatterSimulateAction(target);
    physicsShatterResetAction(target);
    expect(simulateTestParameters(target)['bake']).toBe('');
    expect(simulatePiecePositions(fixture.compile().instances, fixture.source.id)).toEqual(unbroken);
  });
});
