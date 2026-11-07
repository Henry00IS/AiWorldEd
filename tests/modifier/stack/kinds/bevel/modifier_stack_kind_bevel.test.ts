import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackAdd } from '@/modifier/stack/modifier_stack_operations.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierBevelOptionsRead } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';

/**
 * Saves and reloads a volume.
 *
 * @param volume Volume.
 * @returns Reloaded volume.
 */
function reload(volume: ReturnType<typeof modifierVolumeTemplateCreate>) {
  const world = new Group();
  world.add(volume);
  const loaded = new SceneDeserializer()
    .deserialize(new SceneSerializer().serialize(world), new Group())
    .find((object) => ModifierVolume.isVolume(object));
  if (!loaded) throw new Error('Expected a volume');
  return loaded;
}

describe('bevel modifier defaults', () => {
  it('clamps overlap on new bevels, from the template and from the add menu', () => {
    expect(modifierBevelOptionsRead(modifierVolumeTemplateCreate('bevel')).clampOverlap).toBe(true);
    const volume = modifierVolumeTemplateCreate('linear');
    ModifierVolume.write(volume, modifierStackAdd(ModifierVolume.read(volume), 'bevel'));
    expect(modifierBevelOptionsRead(volume).clampOverlap).toBe(true);
    expect(modifierBevelOptionsRead(volume).limitMethod).toBe('angle');
  });

  it('keeps the stored clamp of saved bevels and leaves it off when an old save never stored one', () => {
    const volume = modifierVolumeTemplateCreate('bevel');
    const stack = ModifierVolume.read(volume);
    const step = stack.modifiers[0];
    if (!step) throw new Error('Expected a bevel step');
    delete step.parameters['modifierBevelOptions'];
    volume.userData[MODIFIER_STACK_USERDATA_KEY] = stack;
    expect(modifierBevelOptionsRead(reload(volume)).clampOverlap).toBe(false);
    const kept = modifierVolumeTemplateCreate('bevel');
    expect(modifierBevelOptionsRead(reload(kept)).clampOverlap).toBe(true);
  });
});
