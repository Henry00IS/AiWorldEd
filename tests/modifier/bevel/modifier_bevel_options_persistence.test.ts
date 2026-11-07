import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  modifierBevelOptionsNormalize,
  modifierBevelOptionsRead,
  modifierBevelOptionsWrite,
} from '@/modifier/volume/modifier_volume_bevel_options.js';
import { CommandModifierBevelDistanceSet } from '@/modifier/volume/command_modifier_bevel_distance_set.js';
import { modifierBevelDerivedFromCache } from '@/modifier/compile/modifier_bevel_derived_cache.js';
import { bevelOptionsFixture } from './modifier_bevel_options_fixture.js';

/**
 * Old scenes default identically, while every new setting survives persistence
 * and undo.
 */
describe('bevel options persistence', () => {
  it('roundtrips all new options and defaults old scenes', () => {
    const options = modifierBevelOptionsNormalize({
      profile: 0.375,
      widthMode: 'percent',
      clampOverlap: true,
      corner: 'patch',
      capProjection: 'axis',
      capTextureId: 'cap.jpg',
      trimSeam: 0.25,
      trimOrigin: 'end',
      trimDirection: 'reverse',
      normals: 'smooth',
    });
    const volume = ModifierVolumeBevel.create(),
      world = new Group();
    modifierBevelOptionsWrite(volume, options);
    world.add(volume);
    const json = new SceneSerializer().serialize(world);
    const loaded = new SceneDeserializer()
      .deserialize(json, new Group())
      .find((object) => ModifierVolumeBevel.isVolume(object));
    if (!loaded) throw new Error('Expected restored bevel volume');
    expect(modifierBevelOptionsRead(loaded)).toEqual(options);
    const legacy = JSON.parse(JSON.stringify(json));
    for (const entry of legacy.objects) if (entry.modifierBevel) delete entry.modifierBevel.options;
    const old = new SceneDeserializer()
      .deserialize(legacy, new Group())
      .find((object) => ModifierVolumeBevel.isVolume(object));
    if (!old) throw new Error('Expected legacy bevel volume');
    expect(modifierBevelOptionsRead(old)).toEqual(modifierBevelOptionsNormalize());
  });
  it('undoes options, preserves duplication and invalidates cached geometry for every option', () => {
    const { instance, volume } = bevelOptionsFixture({}, 4, true);
    const before = ModifierVolumeBevel.readSettings(volume);
    const options = modifierBevelOptionsNormalize({ profile: 0.375, trimSeam: 0.25 });
    const command = new CommandModifierBevelDistanceSet([{ volume, before, after: { ...before, options } }]);
    command.execute();
    expect(modifierBevelOptionsRead(volume)).toEqual(options);
    const clone = ModifierVolumeBevel.create();
    ModifierVolumeBevel.copyOntoClone(volume, clone);
    expect(modifierBevelOptionsRead(clone)).toEqual(options);
    command.undo();
    expect(modifierBevelOptionsRead(volume)).toEqual(before.options);
    verifyOptionCache(instance, volume);
  });
});

/**
 * Changes every new field in turn and checks cache invalidation.
 *
 * @param instance Source brush.
 * @param volume Covering modifier.
 */
function verifyOptionCache(
  instance: ReturnType<typeof bevelOptionsFixture>['instance'],
  volume: ReturnType<typeof ModifierVolumeBevel.create>,
): void {
  const options = modifierBevelOptionsNormalize({
    profile: 0.375,
    widthMode: 'width',
    clampOverlap: true,
    corner: 'patch',
    capProjection: 'axis',
    capTextureId: 'cap',
    trimSeam: 0.5,
    trimOrigin: 'center',
    trimDirection: 'reverse',
    normals: 'smooth',
  });
  modifierBevelDerivedFromCache(instance, [volume]);
  for (const [key, value] of Object.entries(options)) {
    const before = modifierBevelOptionsRead(volume);
    modifierBevelOptionsWrite(volume, { ...before, [key]: value });
    expect(modifierBevelDerivedFromCache(instance, [volume])?.rebuilt, key).toBe(true);
    expect(modifierBevelDerivedFromCache(instance, [volume])?.rebuilt, key).toBe(false);
  }
}
