import { describe, expect, it, vi } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

/**
 * Creates an empty Physics Shatter volume.
 *
 * @returns Fixture, volume uuid and its modifier id.
 */
function shatterCreate() {
  const fixture = editorApiFixtureCreate();
  const created = fixture.api.invokeTool('modifier_volume_create', {
    templateId: 'physicsShatter',
    size: { x: 2, y: 2, z: 2 },
  });
  expect(created.ok, created.message).toBe(true);
  const objectId = (created.data as { objectId: string }).objectId;
  const modifierId = ModifierVolume.read(fixture.world.getObjectByProperty('uuid', objectId)!).modifiers[0]?.id ?? '';
  return { ...fixture, objectId, modifierId };
}

/** Action rows of the first modifier as modifier_stack_get lists them. */
type ActionRows = { key: string; label: string; available: boolean; status?: string }[];

describe('modifier action tools', () => {
  it('lists the buttons of a modifier and refuses to store a value for one', () => {
    const { api, objectId, modifierId } = shatterCreate();
    const stack = api.invokeTool('modifier_stack_get', { objectId }).data as { modifiers: { actions?: ActionRows }[] };
    const actions = stack.modifiers[0]?.actions ?? [];
    expect(actions.map((action) => [action.key, action.available])).toEqual([
      ['simulate', true],
      ['resetBake', false],
    ]);
    const set = api.invokeTool('modifier_parameters_set', { objectId, modifierId, parameters: { simulate: 'x' } });
    expect(set.ok).toBe(false);
    expect(set.message).toMatch(/modifier_action_run/);
  });

  it('refuses unknown and unavailable buttons', () => {
    const { api, objectId, modifierId } = shatterCreate();
    const unknown = api.invokeTool('modifier_action_run', { objectId, modifierId, actionKey: 'nope' });
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toMatch(/simulate/);
    const reset = api.invokeTool('modifier_action_run', { objectId, modifierId, actionKey: 'resetBake' });
    expect(reset.ok).toBe(false);
  });

  it('presses a button like a click and reports its status line in the stack', async () => {
    const { api, objectId, modifierId } = shatterCreate();
    const run = api.invokeTool('modifier_action_run', { objectId, modifierId, actionKey: 'simulate' });
    expect(run.ok, run.message).toBe(true);
    await vi.waitFor(() => {
      const stack = api.invokeTool('modifier_stack_get', { objectId }).data as {
        modifiers: { actions?: ActionRows }[];
      };
      const simulate = stack.modifiers[0]?.actions?.find((action) => action.key === 'simulate');
      expect(simulate?.status).toMatch(/Nothing To Shatter/);
    });
  });

  it('offers every generator kind, Blast Hole included, and creates one', () => {
    const { api } = editorApiFixtureCreate();
    const tool = api.toolsList().find((candidate) => candidate.name === 'modifier_generator_create');
    const kinds = (
      (tool?.inputSchema['properties'] as Record<string, unknown> | undefined)?.['kind'] as
        { enum?: string[] } | undefined
    )?.enum;
    expect(kinds).toEqual([...MODIFIER_GENERATOR_NODE_KINDS]);
    expect(kinds).toContain('blastHole');
    const modelId = (api.invokeTool('solid_model_create', {}).data as { modelId: string }).modelId;
    const created = api.invokeTool('modifier_generator_create', { kind: 'blastHole', modelId });
    expect(created.ok, created.message).toBe(true);
  });
});
