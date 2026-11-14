import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import { DECAL_DIRECTION_ARROW_USERDATA_KEY } from '@/decal/volume/decal_direction_arrow.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { decalTestProjector } from '../../decal/decal_test_fixture.js';

describe('scene decal projector round trip', () => {
  beforeEach(() => setTextureMapCacheForTests(new TextureMapCache()));
  afterEach(() => setTextureMapCacheForTests(null));

  it('saves a decal projector as a modifier volume and loads it with its options, pose, outline and arrow', () => {
    const world = new THREE.Group();
    const projector = decalTestProjector({
      layer: 3,
      texture: 'stain',
      lift: 0.003,
      layerLift: 0.001,
      firstHitOnly: true,
      unfoldSticker: true,
    });
    projector.position.set(1, 2, 3);
    projector.scale.set(2, 0.5, 4);
    world.add(projector);
    const saved = new SceneSerializer().serialize(world);
    const entry = saved.objects.find((candidate) => candidate.uuid === projector.uuid);
    expect(entry?.modifierStack?.role).toBe('decal');
    const loaded = new SceneDeserializer().deserialize(saved, new THREE.Group());
    const restored = loaded.find((object) => ModifierVolume.isDecal(object));
    expect(restored).toBeDefined();
    if (!restored) return;
    expect(DecalProjectorSettingsStore.read(restored)).toEqual(DecalProjectorSettingsStore.read(projector));
    expect(restored.position.toArray()).toEqual([1, 2, 3]);
    expect(restored.scale.toArray()).toEqual([2, 0.5, 4]);
    const lines = restored.children.filter((child) => child instanceof THREE.LineSegments);
    expect(lines.length).toBe(2);
    expect(lines.filter((line) => line.userData[DECAL_DIRECTION_ARROW_USERDATA_KEY] === true).length).toBe(1);
  });
});
