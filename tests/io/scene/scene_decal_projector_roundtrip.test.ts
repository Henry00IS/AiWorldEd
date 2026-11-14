import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { DecalProjectorVolume } from '@/decal/volume/decal_projector_volume.js';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';

describe('scene decal projector round trip', () => {
  beforeEach(() => setTextureMapCacheForTests(new TextureMapCache()));
  afterEach(() => setTextureMapCacheForTests(null));

  it('saves and loads a decal projector with its settings, pose and a single outline', () => {
    const world = new THREE.Group();
    const projector = DecalProjectorVolume.create({ mode: 'surfaceMesh', layer: 3, textureId: 'stain', opacity: 0.5 });
    projector.position.set(1, 2, 3);
    projector.scale.set(2, 0.5, 4);
    world.add(projector);
    const saved = new SceneSerializer().serialize(world);
    const loadedWorld = new THREE.Group();
    const loaded = new SceneDeserializer().deserialize(saved, loadedWorld);
    const restored = loaded.find((object) => DecalProjectorSettingsStore.isProjector(object));
    expect(restored).toBeDefined();
    if (!restored) return;
    expect(DecalProjectorSettingsStore.read(restored)).toEqual(DecalProjectorSettingsStore.read(projector));
    expect(restored.position.toArray()).toEqual([1, 2, 3]);
    expect(restored.scale.toArray()).toEqual([2, 0.5, 4]);
    expect(restored.children.filter((child) => child instanceof THREE.LineSegments).length).toBe(1);
  });
});
