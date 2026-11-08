import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MODIFIER_STACK_HELPER_KEY,
  modifierStackHelpersSync,
  modifierStackHelpersVisible,
} from '@/modifier/stack/helpers/modifier_stack_helpers.js';
import { modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { stackFixture } from '../modifier_stack_fixture.js';

/**
 * Returns the helper children of a volume.
 *
 * @param volume Modifier volume.
 * @returns Helper objects.
 */
function helpers(volume: THREE.Object3D): THREE.Object3D[] {
  return volume.children.filter((child) => child.userData[MODIFIER_STACK_HELPER_KEY] === true);
}

/**
 * Folds or unfolds one modifier card the way the inspector stores it.
 *
 * @param volume Modifier volume.
 * @param index Stack index.
 * @param expanded True to unfold.
 */
function cardFold(volume: THREE.Object3D, index: number, expanded: boolean): void {
  const settings = ModifierVolume.read(volume);
  settings.modifiers = settings.modifiers.map((entry, at) => (at === index ? { ...entry, expanded } : entry));
  ModifierVolume.write(volume, settings);
}

describe('modifier helper visibility', () => {
  it('shows a modifier helper only while it is enabled and its card is unfolded', () => {
    const fixture = stackFixture([{ kind: 'mirror', parameters: { axis: 'x' } }]);
    const entry = ModifierVolume.read(fixture.volume).modifiers[0];
    if (!entry) throw new Error('Expected a mirror entry');
    expect(modifierStackHelpersVisible(entry)).toBe(true);
    expect(modifierStackHelpersVisible({ ...entry, expanded: false })).toBe(false);
    expect(modifierStackHelpersVisible({ ...entry, enabled: false })).toBe(false);
  });

  it('hides the mirror plane when its card collapses and restores it when unfolded', () => {
    const fixture = stackFixture([
      { kind: 'mirror', parameters: { axis: 'x' } },
      { kind: 'mirror', parameters: { axis: 'y' } },
    ]);
    modifierStackHelpersSync(fixture.volume, true);
    expect(helpers(fixture.volume)).toHaveLength(2);
    cardFold(fixture.volume, 0, false);
    modifierBevelRefreshScene(fixture.world);
    expect(helpers(fixture.volume)).toHaveLength(1);
    cardFold(fixture.volume, 1, false);
    modifierBevelRefreshScene(fixture.world);
    expect(helpers(fixture.volume)).toHaveLength(0);
    cardFold(fixture.volume, 0, true);
    modifierBevelRefreshScene(fixture.world);
    expect(helpers(fixture.volume)).toHaveLength(1);
  });

  it('draws no helpers for kinds that define none', () => {
    const fixture = stackFixture(['linear', 'bevel']);
    modifierStackHelpersSync(fixture.volume, true);
    expect(helpers(fixture.volume)).toHaveLength(0);
    expect(
      modifierStackKinds
        .filter((kind) => kind.id !== 'mirror')
        .every((kind) => kind.helpers(fixture.volume, {}).length === 0),
    ).toBe(true);
  });
});
