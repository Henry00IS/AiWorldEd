import { describe, expect, it } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { MODIFIER_STACK_KIND_PHYSICS_SHATTER } from '@/modifier/stack/kinds/shatter/modifier_stack_kind_physics_shatter.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import {
  PHYSICS_SHATTER_SIM_PARAMETER_KEYS,
  physicsShatterBakeKey,
} from '@/modifier/stack/kinds/shatter/physics_shatter_bake_key.js';
import { physicsShatterBakeParameters } from '@/modifier/stack/kinds/shatter/physics_shatter_format_version.js';
import { PHYSICS_SHATTER_BAKE_STALE } from '@/modifier/stack/kinds/shatter/physics_shatter_bake_state.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/** Default simulation settings of the tests. */
const BAKE_KEY_SIM = { strength: 10, radius: 1.5, duration: 1, directionX: 0, directionY: 0, directionZ: -1 };

/**
 * Builds a shattered box with an action target for its step.
 *
 * @param extra Parameters to add.
 * @returns Fixture and target.
 */
function bakeKeyFixture(extra: Record<string, unknown> = {}) {
  const fixture = stackFixture([
    { kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters: { crackSize: 0.4, ...BAKE_KEY_SIM, ...extra } },
  ]);
  const stepId = ModifierVolume.read(fixture.volume).modifiers[0]?.id ?? '';
  const target: ModifierStackActionTarget = { volume: fixture.volume, stepId, commandStack: null, status: () => {} };
  return { fixture, target, stepId };
}

/**
 * Changes one step parameter directly and recompiles.
 *
 * @param fixture Stack fixture.
 * @param patch Parameters to change.
 */
function bakeKeyPatch(fixture: ReturnType<typeof stackFixture>, patch: Record<string, unknown>): void {
  const settings = ModifierVolume.read(fixture.volume);
  const step = settings.modifiers[0];
  if (step) step.parameters = { ...step.parameters, ...patch };
  ModifierVolume.write(fixture.volume, settings);
  fixture.compile();
}

/**
 * Returns the status of the last run of the fixture's step.
 *
 * @param fixture Stack fixture.
 * @param stepId Step id.
 * @returns Bake status.
 */
function bakeKeyStatus(fixture: ReturnType<typeof stackFixture>, stepId: string): string | undefined {
  return physicsShatterLastRunOf(fixture.volume.uuid, stepId)?.status;
}

describe('physics shatter bake key', () => {
  it('mixes the input hash with every simulation setting, and only those', () => {
    const base = physicsShatterBakeKey('0123456789abcdef', BAKE_KEY_SIM);
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    expect(physicsShatterBakeKey('0123456789abcdef', { ...BAKE_KEY_SIM })).toBe(base);
    expect(physicsShatterBakeKey('fedcba9876543210', BAKE_KEY_SIM)).not.toBe(base);
    for (const key of PHYSICS_SHATTER_SIM_PARAMETER_KEYS)
      expect(physicsShatterBakeKey('0123456789abcdef', { ...BAKE_KEY_SIM, [key]: 0.75 })).not.toBe(base);
    expect(physicsShatterBakeKey('0123456789abcdef', { ...BAKE_KEY_SIM, insideScaleU: 3 })).toBe(base);
  });

  it('covers strength, direction, radius, duration and solver iterations', () => {
    for (const key of ['strength', 'radius', 'duration', 'directionX', 'directionY', 'directionZ', 'solverIterations'])
      expect(PHYSICS_SHATTER_SIM_PARAMETER_KEYS).toContain(key);
  });

  it('reads a missing solver iteration count as the default', () => {
    const { fixture, stepId } = bakeKeyFixture();
    const keyOf = () => physicsShatterLastRunOf(fixture.volume.uuid, stepId)?.bakeKey;
    fixture.compile();
    const missing = keyOf();
    bakeKeyPatch(fixture, { solverIterations: 8 });
    expect(keyOf()).toBe(missing);
    bakeKeyPatch(fixture, { solverIterations: 12 });
    expect(keyOf()).not.toBe(missing);
    expect(physicsShatterBakeKey('0123456789abcdef', { ...BAKE_KEY_SIM, solverIterations: 40 })).toBe(
      physicsShatterBakeKey('0123456789abcdef', { ...BAKE_KEY_SIM, solverIterations: 16 }),
    );
  });

  it('keeps the fracture memo key apart from the bake key', () => {
    const { fixture, stepId } = bakeKeyFixture();
    fixture.compile();
    const before = physicsShatterLastRunOf(fixture.volume.uuid, stepId);
    bakeKeyPatch(fixture, { strength: 20 });
    const after = physicsShatterLastRunOf(fixture.volume.uuid, stepId);
    expect(after?.inputHash).toBe(before?.inputHash);
    expect(after?.fracture).toBe(before?.fracture);
    expect(after?.bakeKey).not.toBe(before?.bakeKey);
  });

  it('shows resimulate when a simulation setting changes after a bake stored under the bake key', async () => {
    const { fixture, target, stepId } = bakeKeyFixture();
    fixture.compile();
    await physicsShatterSimulateAction(target);
    const run = physicsShatterLastRunOf(fixture.volume.uuid, stepId);
    const bake = String(ModifierVolume.read(fixture.volume).modifiers[0]?.parameters['bake'] ?? '');
    bakeKeyPatch(fixture, physicsShatterBakeParameters(bake, run?.bakeKey ?? ''));
    expect(bakeKeyStatus(fixture, stepId)).toBe('baked');
    for (const [key, value] of [
      ['strength', 25],
      ['directionX', 1],
      ['radius', 3],
      ['duration', 2],
    ] as const) {
      bakeKeyPatch(fixture, { [key]: value });
      expect(bakeKeyStatus(fixture, stepId)).toBe('stale');
      expect(modifierStackStatusRead(fixture.volume)?.steps[0]?.error).toContain(PHYSICS_SHATTER_BAKE_STALE);
      bakeKeyPatch(fixture, { [key]: (BAKE_KEY_SIM as Record<string, number>)[key] ?? 8 });
      expect(bakeKeyStatus(fixture, stepId)).toBe('baked');
    }
  });

  it('still reads a bake stored under the bare input hash as matching its fracture', async () => {
    const { fixture, target, stepId } = bakeKeyFixture();
    fixture.compile();
    await physicsShatterSimulateAction(target);
    bakeKeyPatch(fixture, {});
    expect(bakeKeyStatus(fixture, stepId)).toBe('baked');
    bakeKeyPatch(fixture, { seed: 99 });
    expect(bakeKeyStatus(fixture, stepId)).toBe('stale');
  });
});
