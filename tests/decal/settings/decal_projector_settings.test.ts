import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_KIND_DECAL } from '@/modifier/stack/kinds/decal/modifier_stack_kind_decal.js';
import { decalTestParametersSet, decalTestProjector } from '../decal_test_fixture.js';
import { DECAL_IMAGE_WINDOW_WHOLE, decalImageWindowApply } from '@/decal/image/decal_image_window.js';

describe('DecalProjectorSettingsStore', () => {
  it('reads every option from the Decal modifier of a decal projector volume', () => {
    const projector = decalTestProjector({
      texture: 'grime',
      layer: 5,
      facingLimit: 60,
      lift: 0.005,
      layerLift: 0.001,
      firstHitOnly: true,
      unfoldSticker: true,
    });
    expect(ModifierVolume.isVolume(projector)).toBe(true);
    expect(ModifierVolume.isDecal(projector)).toBe(true);
    expect(DecalProjectorSettingsStore.isActiveProjector(projector)).toBe(true);
    expect(DecalProjectorSettingsStore.read(projector)).toEqual({
      textureId: 'grime',
      window: DECAL_IMAGE_WINDOW_WHOLE,
      layer: 5,
      facingLimitDegrees: 60,
      lift: 0.005,
      layerLift: 0.001,
      firstHitOnly: true,
      unfoldSticker: true,
    });
  });

  it('clamps stored values through the modifier fields', () => {
    const projector = decalTestProjector({
      lift: -1,
      layerLift: 7,
      layer: 2.6,
      facingLimit: Number.NaN,
    });
    const settings = DecalProjectorSettingsStore.read(projector);
    expect(settings.lift).toBe(0);
    expect(settings.layerLift).toBe(1);
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
    const restacked = { ...base, layer: 4 };
    const shielded = { ...base, firstHitOnly: true };
    const unfolded = { ...base, unfoldSticker: true };
    expect(DecalProjectorSettingsStore.geometryKey(restacked)).toBe(DecalProjectorSettingsStore.geometryKey(base));
    expect(DecalProjectorSettingsStore.appearanceKey(restacked)).not.toBe(
      DecalProjectorSettingsStore.appearanceKey(base),
    );
    expect(DecalProjectorSettingsStore.geometryKey(shielded)).not.toBe(DecalProjectorSettingsStore.geometryKey(base));
    expect(DecalProjectorSettingsStore.geometryKey(unfolded)).not.toBe(
      DecalProjectorSettingsStore.geometryKey({ ...unfolded, unfoldSticker: false }),
    );
    expect(DecalProjectorSettingsStore.unfolds(unfolded)).toBe(true);
  });

  it('exposes every decal option as a field of the Decal modifier', () => {
    const keys = modifierStackKindFind(MODIFIER_STACK_KIND_DECAL)?.fields.map((field) => field.key);
    expect(keys).toEqual([
      'texture',
      'uvMinU',
      'uvMinV',
      'uvMaxU',
      'uvMaxV',
      'uvRotation',
      'uvFlipU',
      'uvFlipV',
      'layer',
      'facingLimit',
      'firstHitOnly',
      'lift',
      'layerLift',
      'unfoldSticker',
    ]);
  });

  it('defaults to a small lift and layer lift and keys geometry on both', () => {
    const base = DecalProjectorSettingsStore.fromParameters({});
    expect(base.lift).toBe(0.0004);
    expect(base.layerLift).toBe(0.0002);
    expect(DecalProjectorSettingsStore.liftOffset(base, 0)).toBe(0.0004);
    expect(DecalProjectorSettingsStore.liftOffset(base, 3)).toBeCloseTo(0.001, 9);
    expect(DecalProjectorSettingsStore.geometryKey({ ...base, lift: 0.7 })).not.toBe(
      DecalProjectorSettingsStore.geometryKey(base),
    );
    expect(DecalProjectorSettingsStore.geometryKey({ ...base, layerLift: 0.7 })).not.toBe(
      DecalProjectorSettingsStore.geometryKey(base),
    );
  });

  it('migrates saves with Projector mode, opacity, a lift slider or a lift distance', () => {
    const slider = DecalProjectorSettingsStore.fromParameters({
      mode: 'projector',
      opacity: 0.4,
      lift: 0.5,
      liftDistance: 0.01,
    });
    expect(slider.lift).toBeCloseTo(0.005, 9);
    expect(slider).not.toHaveProperty('mode');
    expect(slider).not.toHaveProperty('opacity');
    expect(DecalProjectorSettingsStore.fromParameters({ liftDistance: 0.002 }).lift).toBeCloseTo(0.0004, 9);
    const kind = modifierStackKindFind(MODIFIER_STACK_KIND_DECAL);
    const normalized = kind?.normalizeParameters({ mode: 'surfaceMesh', opacity: 0.4, liftDistance: 0.002 }) ?? {};
    expect(Object.keys(normalized)).not.toContain('mode');
    expect(Object.keys(normalized)).not.toContain('opacity');
    expect(Object.keys(normalized)).not.toContain('liftDistance');
  });
});

describe('decal image window', () => {
  it('reads the UV rectangle, rotation and flips, whole texture by default', () => {
    expect(DecalProjectorSettingsStore.fromParameters({}).window).toEqual(DECAL_IMAGE_WINDOW_WHOLE);
    const window = DecalProjectorSettingsStore.fromParameters({
      uvMinU: 0.25,
      uvMinV: 0.5,
      uvMaxU: 0.5,
      uvMaxV: 0.75,
      uvRotation: '270',
      uvFlipU: true,
    }).window;
    expect(window).toEqual({
      minU: 0.25,
      minV: 0.5,
      maxU: 0.5,
      maxV: 0.75,
      quarterTurns: 3,
      flipU: true,
      flipV: false,
    });
  });

  it('maps image coordinates into an atlas cell, turned and mirrored', () => {
    const cell = { ...DECAL_IMAGE_WINDOW_WHOLE, minU: 0.5, minV: 0.25, maxU: 0.75, maxV: 0.5 };
    const corners = () => new Float32Array([0, 0, 1, 0, 1, 1, 0.5, 0.5]);
    const plain = corners();
    decalImageWindowApply(plain, cell);
    expect(Array.from(plain)).toEqual([0.5, 0.25, 0.75, 0.25, 0.75, 0.5, 0.625, 0.375]);
    const turned = corners();
    decalImageWindowApply(turned, { ...cell, quarterTurns: 1 });
    expect(Array.from(turned)).toEqual([0.75, 0.25, 0.75, 0.5, 0.5, 0.5, 0.625, 0.375]);
    const flipped = corners();
    decalImageWindowApply(flipped, { ...cell, flipU: true });
    expect(Array.from(flipped)).toEqual([0.75, 0.25, 0.5, 0.25, 0.5, 0.5, 0.625, 0.375]);
  });

  it('changes geometry and appearance keys', () => {
    const base = DecalProjectorSettingsStore.fromParameters({});
    const cell = { ...base, window: { ...base.window, maxU: 0.5 } };
    expect(DecalProjectorSettingsStore.geometryKey(cell)).not.toBe(DecalProjectorSettingsStore.geometryKey(base));
    expect(DecalProjectorSettingsStore.appearanceKey(cell)).not.toBe(DecalProjectorSettingsStore.appearanceKey(base));
  });
});
