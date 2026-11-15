import { describe, expect, it } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

/**
 * Creates a model with a column generator.
 *
 * @returns Fixture, generator uuid and its column modifier id.
 */
function columnCreate() {
  const fixture = editorApiFixtureCreate();
  const modelId = (fixture.api.invokeTool('solid_model_create', {}).data as { modelId: string }).modelId;
  const created = fixture.api.invokeTool('modifier_generator_create', {
    kind: 'column',
    modelId,
    size: { x: 1, y: 3, z: 1 },
  });
  expect(created.ok, created.message).toBe(true);
  const objectId = (created.data as { objectId: string }).objectId;
  const stack = fixture.api.invokeTool('modifier_stack_get', { objectId }).data as {
    modifiers: { modifierId: string; kind: string }[];
  };
  return { ...fixture, objectId, modifierId: stack.modifiers[0]?.modifierId ?? '' };
}

describe('modifier tools', () => {
  it('describes every visible field of every kind with its tooltip', () => {
    const { api } = editorApiFixtureCreate();
    for (const kind of modifierStackKinds) {
      const result = api.invokeTool('modifier_kind_list', { kindId: kind.id });
      expect(result.ok, kind.id).toBe(true);
      const parameters =
        (result.data as { kinds: { parameters: { key: string; hint: string }[] }[] }).kinds[0]?.parameters ?? [];
      expect(parameters.length, kind.id).toBeGreaterThan(0);
      for (const parameter of parameters) expect(parameter.hint, `${kind.id}.${parameter.key}`).not.toBe('');
    }
  });

  it('creates a column, sets parameters with validation and undoes each step', () => {
    const { api, stack, objectId, modifierId, world } = columnCreate();
    const holder = () => world.getObjectByProperty('uuid', objectId);
    const refused = api.invokeTool('modifier_parameters_set', { objectId, modifierId, parameters: { nope: 1 } });
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/Parameters: .*profile/);
    const kind = modifierStackKinds.find((candidate) => candidate.id === 'column');
    const numeric = kind?.fields.find((field) => field.type === 'number');
    expect(numeric).toBeDefined();
    const before = ModifierVolume.read(holder()!).modifiers[0]?.parameters[numeric!.key];
    const set = api.invokeTool('modifier_parameters_set', {
      objectId,
      modifierId,
      parameters: { [numeric!.key]: 1e9 },
    });
    expect(set.ok, set.message).toBe(true);
    expect(ModifierVolume.read(holder()!).modifiers[0]?.parameters[numeric!.key]).not.toBe(1e9);
    stack.undo();
    expect(ModifierVolume.read(holder()!).modifiers[0]?.parameters[numeric!.key]).toEqual(before);
  });

  it('adds, moves, duplicates, disables and removes entries', () => {
    const { api, objectId, world } = columnCreate();
    const stackOf = () => ModifierVolume.read(world.getObjectByProperty('uuid', objectId)!).modifiers;
    expect(api.invokeTool('modifier_entry_add', { objectId, kind: 'stairs' }).ok).toBe(false);
    const added = api.invokeTool('modifier_entry_add', { objectId, kind: 'transform' });
    expect(added.ok, added.message).toBe(true);
    const id = stackOf()[1]?.id ?? '';
    expect(api.invokeTool('modifier_entry_duplicate', { objectId, modifierId: id }).ok).toBe(true);
    expect(stackOf()).toHaveLength(3);
    expect(api.invokeTool('modifier_entry_move', { objectId, modifierId: id, index: 0 }).ok).toBe(false);
    expect(api.invokeTool('modifier_entry_set', { objectId, modifierId: id, enabled: false }).ok).toBe(true);
    expect(stackOf()[1]?.enabled).toBe(false);
    expect(api.invokeTool('modifier_entry_remove', { objectId, modifierId: id }).ok).toBe(true);
    expect(stackOf()).toHaveLength(2);
  });

  it('creates a bevel volume and sets bevel settings and options', () => {
    const { api, world } = editorApiFixtureCreate();
    const created = api.invokeTool('modifier_volume_create', { templateId: 'bevel', size: { x: 2, y: 2, z: 2 } });
    expect(created.ok, created.message).toBe(true);
    const objectId = (created.data as { objectId: string }).objectId;
    const entry = ModifierVolume.read(world.getObjectByProperty('uuid', objectId)!).modifiers[0];
    const result = api.invokeTool('modifier_parameters_set', {
      objectId,
      modifierId: entry?.id,
      parameters: { segments: 3, 'options.clampOverlap': 'off' },
    });
    expect(result.ok, result.message).toBe(true);
    expect(JSON.stringify(api.invokeTool('modifier_stack_get', { objectId }).data)).toContain('"segments":3');
  });
});
