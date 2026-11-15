import { describe, expect, it } from 'vitest';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

/**
 * Creates a model holding one SolidScript generator through the tools.
 *
 * @returns Fixture and the generator id.
 */
function generatorFixture() {
  const fixture = editorApiFixtureCreate();
  const created = fixture.api.invokeTool('solid_model_create', {});
  const modelId = (created.data as { modelId: string }).modelId;
  const generator = fixture.api.invokeTool('modifier_generator_create', { kind: 'solidScript', modelId });
  expect(generator.ok, generator.message).toBe(true);
  const objectId = JSON.stringify(generator.data).match(/"(?:objectId|id|uuid)":"([^"]+)"/)?.[1] ?? '';
  return { ...fixture, objectId };
}

describe('SolidScript generator tools', () => {
  it('list the editor commands from the same catalog as the palette', () => {
    const { api } = editorApiFixtureCreate();
    const result = api.invokeTool('geometry_script_command_list', {});
    const commands = (result.data as { commands: { id: string; example: string; parameters: unknown[] }[] }).commands;
    expect(commands.find((command) => command.id === 'cylinder')?.example).toBe(
      'cylinder(h = 2, r1 = 1, r2 = 1, center = false);',
    );
    expect(commands.find((command) => command.id === 'difference')?.parameters).toEqual([]);
  });

  it('set a script from editor lines or source as one undo step and read it back', () => {
    const { api, stack, objectId } = generatorFixture();
    const before = api.invokeTool('geometry_script_generator_get', { objectId });
    expect(before.ok, before.message).toBe(true);
    const set = api.invokeTool('geometry_script_generator_set', {
      objectId,
      placement: 'fit',
      lines: [
        { command: 'difference' },
        { command: 'cube', values: { size: '[2, 2, 2]' } },
        { code: 'sphere(1.2);' },
        { command: 'end' },
      ],
    });
    expect(set.ok, set.message).toBe(true);
    expect(set.data).toMatchObject({
      placement: 'fit',
      solids: 2,
      error: '',
      source: 'difference() {\ncube(size = [2, 2, 2], center = false);\nsphere(1.2);\n}',
    });
    stack.undo();
    expect(api.invokeTool('geometry_script_generator_get', { objectId }).data).toEqual(before.data);
    const broken = api.invokeTool('geometry_script_generator_set', { objectId, source: 'cube(1);\nsphere(' });
    expect((broken.data as { error: string }).error).toMatch(/^Line 2/);
  });

  it('refuse unknown commands, unknown values and other objects', () => {
    const { api, objectId } = generatorFixture();
    expect(
      api.invokeTool('geometry_script_generator_set', { objectId, lines: [{ command: 'teapot' }] }).message,
    ).toMatch(/Line 1: unknown command teapot/);
    expect(
      api.invokeTool('geometry_script_generator_set', {
        objectId,
        lines: [{ command: 'sphere', values: { size: '1' } }],
      }).message,
    ).toMatch(/no value size/);
    expect(api.invokeTool('geometry_script_generator_set', { objectId, placement: 'tile' }).ok).toBe(false);
    expect(api.invokeTool('geometry_script_generator_get', { objectId: 'nothing' }).ok).toBe(false);
  });
});
