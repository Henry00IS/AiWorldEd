import { describe, expect, it } from 'vitest';
import { MCP_SERVER_INSTRUCTIONS } from '@/ai/shared/mcp_instructions.js';
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

  it('set a script name and command lines as one undo step and read it back', () => {
    const { api, stack, objectId } = generatorFixture();
    const before = api.invokeTool('geometry_script_generator_get', { objectId });
    expect(before.ok, before.message).toBe(true);
    const set = api.invokeTool('geometry_script_generator_set', {
      objectId,
      name: 'Hollow Box',
      placement: 'fit',
      lines: [
        { command: 'difference' },
        { command: 'cube', values: { size: '[2, 2, 2]' } },
        { command: 'sphere', values: { r: '1.2' } },
        { command: 'end' },
      ],
    });
    expect(set.ok, set.message).toBe(true);
    expect(set.data).toMatchObject({
      name: 'Hollow Box',
      placement: 'fit',
      solids: 2,
      error: '',
      source: 'difference() {\ncube(size = [2, 2, 2], center = false);\nsphere(r = 1.2);\n}',
    });
    expect((set.data as { lines: unknown[] }).lines[2]).toMatchObject({
      line: 3,
      command: 'sphere',
      values: { r: '1.2' },
    });
    stack.undo();
    expect(api.invokeTool('geometry_script_generator_get', { objectId }).data).toEqual(before.data);
    const broken = api.invokeTool('geometry_script_generator_set', {
      objectId,
      lines: [{ command: 'cube' }, { command: 'sphere', values: { r: '1 +' } }],
    });
    expect((broken.data as { error: string }).error).toMatch(/^Line 2/);
  });

  it('accept command lines only, no free code', () => {
    const { api, objectId } = generatorFixture();
    const result = api.invokeTool('geometry_script_generator_set', { objectId, lines: [{ code: 'cube(1);' }] });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Line 1: unknown command/);
  });

  it('describe the whole language in a reference an assistant can read before writing scripts', () => {
    const { api } = editorApiFixtureCreate();
    const result = api.invokeTool('geometry_script_reference_get', {});
    expect(result.ok).toBe(true);
    const text = (result.data as { reference: string }).reference;
    for (const topic of [
      'Coordinates',
      'Grammar',
      'Common mistakes',
      'Examples',
      'Not supported',
      'cylinder(',
      'Use Part',
    ])
      expect(text, topic).toContain(topic);
  });

  it('build every example of the reference, source examples as source and line examples as generator lines', () => {
    const { api, objectId } = generatorFixture();
    const text = (api.invokeTool('geometry_script_reference_get', {}).data as { reference: string }).reference;
    const examples = [...text.matchAll(/```\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');
    expect(examples.length).toBeGreaterThan(2);
    for (const example of examples) {
      const result = example.startsWith('[')
        ? api.invokeTool('geometry_script_generator_set', { objectId, lines: JSON.parse(example) as unknown[] })
        : api.invokeTool('geometry_script_build', { source: example });
      expect(result.ok, result.message).toBe(true);
      if (example.startsWith('[')) expect(result.data).toMatchObject({ error: '', solids: 5 });
    }
  });

  it('send every agent to the reference before its first script', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('Read geometry_script_reference_get once first');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('command lines (no free code)');
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
