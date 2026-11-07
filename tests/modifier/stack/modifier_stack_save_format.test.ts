import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { stackFixture } from './modifier_stack_fixture.js';

/**
 * Loads saved scene data into a fresh group.
 *
 * @param json Scene data.
 * @returns Loaded modifier volume.
 */
function loadVolume(json: unknown): THREE.Object3D {
  const loaded = new SceneDeserializer()
    .deserialize(json as never, new THREE.Group())
    .find((object) => ModifierVolume.isVolume(object));
  if (!loaded) throw new Error('Expected a modifier volume');
  return loaded;
}

describe('modifier stack save format', () => {
  it('round-trips the whole stack as format 4', () => {
    const fixture = stackFixture([
      { kind: 'stairs', parameters: { sizing: 'count', count: 5 } },
      'bevel',
      { kind: 'mirror', enabled: false },
    ]);
    ModifierVolumeBevel.writeDistance(fixture.volume, 0.2);
    const json = new SceneSerializer().serialize(fixture.world);
    expect(json.version).toBe(4);
    const loaded = loadVolume(json);
    expect(ModifierVolume.read(loaded)).toEqual(ModifierVolume.read(fixture.volume));
    expect(ModifierVolumeBevel.readDistance(loaded)).toBeCloseTo(0.2);
  });

  it('loads an old bevel volume as a stack with one equivalent bevel', () => {
    const json = new SceneSerializer().serialize(stackFixture(['bevel']).world) as unknown as {
      objects: Record<string, unknown>[];
    };
    for (const entry of json.objects) {
      if (!entry['modifierStack']) continue;
      delete entry['modifierStack'];
      entry['modifierBevel'] = { distance: 0.125, segments: 3, uvLayout: 'trim', blacklist: ['gone'] };
    }
    const loaded = loadVolume(json);
    const stack = ModifierVolume.read(loaded);
    expect(stack.modifiers.map((entry) => entry.kind)).toEqual(['bevel']);
    expect(ModifierVolumeBevel.readDistance(loaded)).toBeCloseTo(0.125);
    expect(ModifierVolumeBevel.readSegments(loaded)).toBe(3);
    expect(ModifierVolumeBevel.readUvLayout(loaded)).toBe('trim');
    expect(stack.excludedIds).toEqual(['gone']);
  });
});
