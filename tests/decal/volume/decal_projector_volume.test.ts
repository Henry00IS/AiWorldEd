import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalProjectorVolume } from '@/decal/volume/decal_projector_volume.js';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';

describe('DecalProjectorVolume', () => {
  it('creates a unit box projector carrying its settings and an outline', () => {
    const volume = DecalProjectorVolume.create({ layer: 2 });
    expect(DecalProjectorSettingsStore.isProjector(volume)).toBe(true);
    expect(DecalProjectorSettingsStore.read(volume).layer).toBe(2);
    volume.geometry.computeBoundingBox();
    const size = volume.geometry.boundingBox?.getSize(new THREE.Vector3());
    expect(size?.toArray()).toEqual([1, 1, 1]);
    expect(volume.children.some((child) => child instanceof THREE.LineSegments)).toBe(true);
  });
});
