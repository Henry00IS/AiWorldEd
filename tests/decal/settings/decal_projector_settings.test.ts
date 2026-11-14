import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DECAL_PROJECTOR_USERDATA_KEY,
  DecalProjectorSettingsStore,
} from '@/decal/settings/decal_projector_settings.js';

describe('DecalProjectorSettingsStore', () => {
  it('fills defaults and clamps stored values into range', () => {
    const settings = DecalProjectorSettingsStore.normalize({
      opacity: 4,
      layer: 2.6,
      liftDistance: -1,
      facingLimitDegrees: Number.NaN,
    });
    const defaults = DecalProjectorSettingsStore.defaults();
    expect(settings.opacity).toBe(1);
    expect(settings.layer).toBe(3);
    expect(settings.liftDistance).toBe(DecalProjectorSettingsStore.minimumLiftDistance);
    expect(settings.facingLimitDegrees).toBe(defaults.facingLimitDegrees);
    expect(settings.mode).toBe('projector');
  });

  it('marks objects as projectors and reads back what was written', () => {
    const object = new THREE.Object3D();
    expect(DecalProjectorSettingsStore.isProjector(object)).toBe(false);
    DecalProjectorSettingsStore.write(object, { mode: 'surfaceMesh', textureId: 'grime', layer: 5 });
    expect(DecalProjectorSettingsStore.isProjector(object)).toBe(true);
    const read = DecalProjectorSettingsStore.read(object);
    expect(read.mode).toBe('surfaceMesh');
    expect(read.textureId).toBe('grime');
    expect(read.layer).toBe(5);
    expect(object.userData[DECAL_PROJECTOR_USERDATA_KEY]).toEqual(read);
  });

  it('changes the geometry key only for settings that shape geometry', () => {
    const base = DecalProjectorSettingsStore.defaults();
    const tinted = { ...base, tint: 0x123456 };
    const lifted = { ...base, liftDistance: base.liftDistance * 2 };
    expect(DecalProjectorSettingsStore.geometryKey(tinted)).toBe(DecalProjectorSettingsStore.geometryKey(base));
    expect(DecalProjectorSettingsStore.appearanceKey(tinted)).not.toBe(DecalProjectorSettingsStore.appearanceKey(base));
    expect(DecalProjectorSettingsStore.geometryKey(lifted)).not.toBe(DecalProjectorSettingsStore.geometryKey(base));
  });
});
