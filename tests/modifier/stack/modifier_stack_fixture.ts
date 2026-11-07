import * as THREE from 'three';
import { expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateEntries } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';

/** Modifier kind with optional parameter overrides. */
export type StackFixtureStep = string | { kind: string; parameters?: Record<string, unknown>; enabled?: boolean };

/**
 * Builds a world with one solid, one box brush and a modifier volume.
 *
 * @param steps Modifiers in stack order.
 * @param volumeScale Uniform volume size.
 * @returns Fixture parts and helpers.
 */
export function stackFixture(steps: readonly StackFixtureStep[], volumeScale = 8) {
  const world = new THREE.Group();
  const model = new SolidModel('Stack test');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  const volume = ModifierVolume.create({ modifiers: stackFixtureEntries(steps) });
  volume.scale.setScalar(volumeScale);
  world.add(volume);
  world.updateMatrixWorld(true);
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  const refresh = () => modifierBevelRefreshScene(world);
  return { world, model, source, volume, compile, refresh };
}

/**
 * Turns fixture steps into stack entries.
 *
 * @param steps Fixture steps.
 * @returns Stack entries.
 */
export function stackFixtureEntries(steps: readonly StackFixtureStep[]) {
  const entries = modifierVolumeTemplateEntries(steps.map((step) => (typeof step === 'string' ? step : step.kind)));
  return entries.map((entry, index) => {
    const step = steps[index];
    if (!step || typeof step === 'string') return entry;
    return {
      ...entry,
      enabled: step.enabled !== false,
      parameters: { ...entry.parameters, ...(step.parameters ?? {}) },
    };
  });
}

/**
 * Returns the compiled result bounds of a model.
 *
 * @param model Solid model.
 * @returns World-independent result bounds.
 */
export function stackResultBounds(model: SolidModel): THREE.Box3 {
  const geometry = model.getResultMesh().geometry;
  geometry.computeBoundingBox();
  return geometry.boundingBox?.clone() ?? new THREE.Box3();
}

/**
 * Verifies every plane bounds every vertex and every edge twin links back.
 *
 * @param instance Brush to check.
 */
export function expectStackConvex(instance: SolidBrushInstance): void {
  for (const plane of instance.brush.planes) {
    for (const vertex of instance.brush.vertices) expect(plane.signedDistance(vertex)).toBeLessThan(1e-5);
  }
  instance.brush.wingEdges.forEach((edge, index) =>
    expect(instance.brush.wingEdges[edge.twinIndex]?.twinIndex).toBe(index),
  );
}

/**
 * Returns compiled brushes that a modifier derived.
 *
 * @param instances Compile list.
 * @param authoredCount Number of authored brushes at the start.
 * @returns Derived brushes.
 */
export function stackDerived(instances: readonly SolidBrushInstance[], authoredCount: number): SolidBrushInstance[] {
  return instances.slice(authoredCount);
}
