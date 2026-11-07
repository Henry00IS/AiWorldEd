import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import { generatorExpand } from '@/modifier/generator/modifier_generator_expansion.js';
import { generatorBrushTouches } from '@/modifier/generator/modifier_generator_capture.js';
import { generatorSettingsNormalize } from '@/modifier/generator/modifier_generator_settings.js';
import { generatorRefreshScene } from '@/modifier/generator/modifier_generator_refresh.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { CommandModifierGeneratorSettings } from '@/modifier/generator/command_modifier_generator_settings.js';
import { CommandObjectHierarchyDelete } from '@/outliner/commands/command_object_hierarchy_delete.js';

vi.mock('@/modifier/generator/modifier_generator_catalog.js', () => ({
  generatorKinds: [],
  generatorKindFind: (id: string) =>
    id === 'fixture'
      ? {
          id,
          label: 'Fixture',
          fields: [],
          transform: (index: number) => new THREE.Matrix4().makeTranslation(index * 2, 0, 0),
        }
      : undefined,
}));

/** Builds an isolated authored fixture. */
function fixture() {
  const world = new THREE.Group();
  const model = new SolidModel('Generator test');
  world.add(model.root);
  const brush = model.addBoxBrush(1, SolidOperation.Additive);
  const volume = ModifierGeneratorVolume.create('fixture');
  volume.scale.setScalar(1.5);
  world.add(volume);
  world.updateMatrixWorld(true);
  return { world, model, brush, volume };
}

describe('generator volume core', () => {
  it('expands deterministically without authoring copies or capturing its own output', () => {
    const { world, model, volume } = fixture();
    const authored = model.getBrushes();
    const before = new SceneSerializer().serialize(world);
    const first = generatorExpand(authored, model.root);
    const second = generatorExpand(authored, model.root);
    expect(first.instances).toHaveLength(3);
    expect(second.instances.map((entry) => entry.id)).toEqual(first.instances.map((entry) => entry.id));
    expect(new SceneSerializer().serialize(world)).toEqual(before);
    expect(model.getBrushes()).toHaveLength(1);
    const copy = first.instances[1];
    expect(copy).toBeDefined();
    if (copy) expect(generatorBrushTouches(copy, volume)).toBe(false);
  });
  it('compiles copies into the visible result and drops stale output on undo/delete', () => {
    const { world, model, volume } = fixture();
    generatorRefreshScene(world);
    model.getResultMesh().geometry.computeBoundingBox();
    expect(model.getResultMesh().geometry.boundingBox?.max.x).toBeCloseTo(4.5);
    const before = ModifierGeneratorVolume.read(volume);
    const command = new CommandModifierGeneratorSettings(volume, before, { ...before, count: 1 });
    command.execute();
    model.getResultMesh().geometry.computeBoundingBox();
    expect(model.getResultMesh().geometry.boundingBox?.max.x).toBeCloseTo(0.5);
    command.undo();
    model.getResultMesh().geometry.computeBoundingBox();
    expect(model.getResultMesh().geometry.boundingBox?.max.x).toBeCloseTo(4.5);
    new CommandObjectHierarchyDelete([volume]).execute();
    model.getResultMesh().geometry.computeBoundingBox();
    expect(model.getResultMesh().geometry.boundingBox?.max.x).toBeCloseTo(0.5);
  });
  it('keeps settings round-trippable and old scenes unchanged', () => {
    const { world, volume } = fixture();
    const json = new SceneSerializer().serialize(world);
    const restored = new THREE.Group();
    new SceneDeserializer().deserialize(json, restored);
    const loaded = restored.getObjectByProperty('uuid', volume.uuid);
    expect(loaded && ModifierGeneratorVolume.read(loaded)).toEqual(ModifierGeneratorVolume.read(volume));
    const legacy = new THREE.Group();
    new SceneDeserializer().deserialize({ version: 3, objects: [] }, legacy);
    expect(legacy.children).toHaveLength(0);
  });
  it('rejects invalid counts, preserves unknown kinds and never accepts source references', () => {
    expect(generatorSettingsNormalize({ count: Infinity }).count).toBe(3);
    expect(generatorSettingsNormalize({ count: -1 }).count).toBe(1);
    expect(generatorSettingsNormalize({ count: 10000 }).count).toBe(128);
    expect(generatorSettingsNormalize({ kind: 'future-kind' }).kind).toBe('future-kind');
    expect(generatorSettingsNormalize({ parameters: { sourceId: 'self' } })).not.toHaveProperty('sourceId');
  });
  it('does not confuse rotated selector bounds with exact brush contact', () => {
    const { world, brush, volume } = fixture();
    volume.scale.set(4, 0.2, 0.2);
    volume.rotation.z = Math.PI / 4;
    brush.mesh?.position.set(1.2, -1.2, 0);
    world.updateMatrixWorld(true);
    expect(generatorBrushTouches(brush, volume)).toBe(false);
    brush.mesh?.position.set(1, 1, 0);
    world.updateMatrixWorld(true);
    expect(generatorBrushTouches(brush, volume)).toBe(true);
  });
  it('overlapping volumes stay additive, not multiplicative', () => {
    const { world, model } = fixture();
    const other = ModifierGeneratorVolume.create('fixture');
    other.scale.setScalar(10);
    world.add(other);
    world.updateMatrixWorld(true);
    expect(generatorExpand(model.getBrushes(), model.root).instances).toHaveLength(5);
  });
});
