import { describe, expect, it } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import {
  modifierStackCacheBudgetFits,
  type ModifierStackCacheEntry,
} from '@/modifier/stack/evaluate/modifier_stack_cache.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { stackFixture, stackFixtureEntries, stackResultBounds } from '../modifier_stack_fixture.js';

/** Linear array along x with fixed spacing. */
const LINEAR_X = { kind: 'linear', parameters: { mode: 'fixed', count: 3, offsetX: 2, offsetY: 0, offsetZ: 0 } };

/**
 * Builds a fixture with a second source and a second volume around it, far from
 * the first pair.
 *
 * @returns Fixture plus the second source and volume.
 */
function twoVolumeFixture() {
  const fixture = stackFixture([LINEAR_X], 8);
  const other = fixture.model.addBoxBrush(1, SolidOperation.Additive);
  other.mesh?.position.set(0, 0, 40);
  const volume = ModifierVolume.create({ modifiers: stackFixtureEntries([LINEAR_X]) });
  volume.scale.setScalar(8);
  volume.position.set(0, 0, 40);
  fixture.world.add(volume);
  return { ...fixture, other, otherVolume: volume };
}

/**
 * Returns the triangle count of the solid result mesh.
 *
 * @param fixture Fixture.
 * @returns Triangle count.
 */
function triangleCount(fixture: ReturnType<typeof twoVolumeFixture>): number {
  const geometry = fixture.model.getResultMesh().geometry;
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

describe('modifier stack evaluation cache', () => {
  it('reuses the same derived instances while nothing a volume reads changed', () => {
    const fixture = twoVolumeFixture();
    const first = fixture.compile();
    const second = fixture.compile();
    expect(first.reusedVolumes).toBe(0);
    expect(second.reusedVolumes).toBe(2);
    expect(second.instances.slice(2)).toEqual(first.instances.slice(2));
    second.instances.slice(2).forEach((brush, index) => expect(brush).toBe(first.instances[index + 2]));
  });

  it('re-evaluates only the volume whose source or settings changed', () => {
    const fixture = twoVolumeFixture();
    fixture.compile();
    fixture.other.mesh?.position.setX(1);
    expect(fixture.compile().reusedVolumes).toBe(1);
    const settings = ModifierVolume.read(fixture.volume);
    const step = settings.modifiers[0];
    if (step) step.parameters = { ...step.parameters, count: 5 };
    ModifierVolume.write(fixture.volume, settings);
    const changed = fixture.compile();
    expect(changed.reusedVolumes).toBe(1);
    expect(modifierStackStatusRead(fixture.volume)?.derived).toBe(4);
    expect(modifierStackStatusRead(fixture.otherVolume)?.derived).toBe(2);
  });

  it('rebuilds the solid partially and matches a full rebuild', () => {
    const fixture = twoVolumeFixture();
    fixture.refresh();
    fixture.other.mesh?.position.setX(1);
    fixture.model.markBrushesDirty([fixture.other.id]);
    fixture.model.rebuild();
    const stats = fixture.model.getCompilerStatsForTesting();
    const partial = { bounds: stackResultBounds(fixture.model), triangles: triangleCount(fixture) };
    expect(stats.fullRebuild).toBe(false);
    expect(stats.reusedBrushCount).toBeGreaterThan(0);
    fixture.model.markDirty();
    fixture.model.rebuild();
    expect(triangleCount(fixture)).toBe(partial.triangles);
    expect(stackResultBounds(fixture.model).equals(partial.bounds)).toBe(true);
  });

  it('drops vanished derived brushes without a full rebuild', () => {
    const fixture = twoVolumeFixture();
    fixture.refresh();
    const settings = ModifierVolume.read(fixture.otherVolume);
    const step = settings.modifiers[0];
    if (step) step.parameters = { ...step.parameters, count: 1 };
    ModifierVolume.write(fixture.otherVolume, settings);
    fixture.refresh();
    const partial = triangleCount(fixture);
    expect(fixture.model.getCompilerStatsForTesting().fullRebuild).toBe(false);
    fixture.model.markDirty();
    fixture.model.rebuild();
    expect(triangleCount(fixture)).toBe(partial);
  });

  it('skips re-evaluating thousands of copies when nothing changed', () => {
    const grid = [
      { kind: 'linear', parameters: { mode: 'fixed', count: 50, offsetX: 2, offsetY: 0, offsetZ: 0 } },
      { kind: 'linear', parameters: { mode: 'fixed', count: 50, offsetX: 0, offsetY: 0, offsetZ: 2 } },
    ];
    const fixture = stackFixture(grid, 400);
    const first = fixture.compile();
    const second = fixture.compile();
    expect(first.instances).toHaveLength(2500);
    expect(second.reusedVolumes).toBe(1);
    expect(second.instances[2499]).toBe(first.instances[2499]);
  });

  it('refreshes a solid with thousands of unchanged copies without recompiling them', () => {
    const grid = [
      { kind: 'linear', parameters: { mode: 'fixed', count: 40, offsetX: 2, offsetY: 0, offsetZ: 0 } },
      { kind: 'linear', parameters: { mode: 'fixed', count: 50, offsetX: 0, offsetY: 0, offsetZ: 2 } },
    ];
    const fixture = stackFixture(grid, 400);
    fixture.refresh();
    fixture.refresh();
    const stats = fixture.model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.reusedBrushCount).toBeGreaterThanOrEqual(1999);
    expect(stats.recompiledBrushCount).toBeLessThanOrEqual(1);
  });
});

/**
 * Builds the budget fields of a cache entry.
 *
 * @param budgetBefore Budget left when the evaluation started.
 * @param budgetUsed Budget the evaluation used.
 * @param budgetLimited Whether the budget limited a request.
 * @returns Cache entry with only the budget fields filled in.
 */
function budgetEntry(budgetBefore: number, budgetUsed: number, budgetLimited: boolean): ModifierStackCacheEntry {
  return { budgetBefore, budgetUsed, budgetLimited } as ModifierStackCacheEntry;
}

describe('modifier stack cache budget reuse', () => {
  it('reuses an unlimited evaluation while the budget left covers what it used', () => {
    expect(modifierStackCacheBudgetFits(budgetEntry(4096, 6, false), 4000)).toBe(true);
    expect(modifierStackCacheBudgetFits(budgetEntry(4096, 6, false), 6)).toBe(true);
    expect(modifierStackCacheBudgetFits(budgetEntry(4096, 6, false), 5)).toBe(false);
  });

  it('reuses a limited evaluation only with the very same budget', () => {
    expect(modifierStackCacheBudgetFits(budgetEntry(10, 10, true), 10)).toBe(true);
    expect(modifierStackCacheBudgetFits(budgetEntry(10, 10, true), 12)).toBe(false);
  });
});
