import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_KIND_DECAL } from '@/modifier/stack/kinds/decal/modifier_stack_kind_decal.js';
import { decalTestParametersSet, decalTestProjector } from '../decal_test_fixture.js';

describe('DecalProjectorSettingsStore', () => {
  it('reads every option from the Decal modifier of a decal projector volume', () => {
    const projector = decalTestProjector('surfaceMesh', {
      texture: 'grime',
      layer: 5,
      opacity: 0.25,
      facingLimit: 60,
      liftDistance: 0.01,
      firstHitOnly: true,
      unfoldSticker: true,
    });
    expect(ModifierVolume.isVolume(projector)).toBe(true);
    expect(ModifierVolume.isDecal(projector)).toBe(true);
    expect(DecalProjectorSettingsStore.isActiveProjector(projector)).toBe(true);
    expect(DecalProjectorSettingsStore.read(projector)).toEqual({
      mode: 'surfaceMesh',
      textureId: 'grime',
      layer: 5,
      opacity: 0.25,
      facingLimitDegrees: 60,
      liftDistance: 0.01,
      firstHitOnly: true,
      unfoldSticker: true,
    });
  });

  it('clamps stored values through the modifier fields', () => {
    const projector = decalTestProjector('projector', {
      opacity: 7,
      liftDistance: -1,
      layer: 2.6,
      facingLimit: Number.NaN,
    });
    const settings = DecalProjectorSettingsStore.read(projector);
    expect(settings.opacity).toBe(1);
    expect(settings.liftDistance).toBe(0.0005);
    expect(settings.layer).toBe(3);
    expect(settings.facingLimitDegrees).toBe(89);
  });

  it('is not active when the volume or its Decal modifier is switched off, or on other objects', () => {
    const projector = decalTestProjector();
    const stack = ModifierVolume.read(projector);
    ModifierVolume.write(projector, { ...stack, enabled: false });
    expect(DecalProjectorSettingsStore.isActiveProjector(projector)).toBe(false);
    ModifierVolume.write(projector, {
      ...stack,
      modifiers: stack.modifiers.map((entry) => ({ ...entry, enabled: false })),
    });
    expect(DecalProjectorSettingsStore.isActiveProjector(projector)).toBe(false);
    expect(DecalProjectorSettingsStore.isActiveProjector(new THREE.Mesh())).toBe(false);
    expect(DecalProjectorSettingsStore.isActiveProjector(ModifierVolume.create({}))).toBe(false);
  });

  it('caches reads until the stack is written again', () => {
    const projector = decalTestProjector();
    const first = DecalProjectorSettingsStore.read(projector);
    expect(DecalProjectorSettingsStore.read(projector)).toBe(first);
    decalTestParametersSet(projector, { layer: 4 });
    expect(DecalProjectorSettingsStore.read(projector).layer).toBe(4);
  });

  it('separates geometry keys from appearance keys', () => {
    const base = DecalProjectorSettingsStore.fromParameters({});
    const faded = { ...base, opacity: 0.5 };
    const shielded = { ...base, firstHitOnly: true };
    const unfolded = { ...base, mode: 'surfaceMesh' as const, unfoldSticker: true };
    expect(DecalProjectorSettingsStore.geometryKey(faded)).toBe(DecalProjectorSettingsStore.geometryKey(base));
    expect(DecalProjectorSettingsStore.appearanceKey(faded)).not.toBe(DecalProjectorSettingsStore.appearanceKey(base));
    expect(DecalProjectorSettingsStore.geometryKey(shielded)).not.toBe(DecalProjectorSettingsStore.geometryKey(base));
    expect(DecalProjectorSettingsStore.geometryKey(unfolded)).not.toBe(
      DecalProjectorSettingsStore.geometryKey({ ...unfolded, unfoldSticker: false }),
    );
    expect(DecalProjectorSettingsStore.unfolds({ ...base, unfoldSticker: true })).toBe(false);
  });

  it('exposes every decal option as a field of the Decal modifier', () => {
    const keys = modifierStackKindFind(MODIFIER_STACK_KIND_DECAL)?.fields.map((field) => field.key);
    expect(keys).toEqual([
      'mode',
      'texture',
      'opacity',
      'layer',
      'facingLimit',
      'firstHitOnly',
      'liftDistance',
      'unfoldSticker',
    ]);
  });
});
