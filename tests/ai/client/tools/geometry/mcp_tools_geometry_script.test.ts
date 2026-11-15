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
    const commands = (
      result.data as {
        commands: { id: string; manual: string; example: { command: string; listed: string }; parameters: unknown[] }[];
      }
    ).commands;
    const cylinder = commands.find((command) => command.id === 'cylinder');
    expect(cylinder?.example).toMatchObject({ command: 'cylinder', listed: "Cylinder  height '1', radius '1'" });
    expect(cylinder?.manual).not.toBe('');
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
        { command: 'cube', values: { size: '2, 2, 2' } },
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
    });
    expect(set.data).not.toHaveProperty('source');
    expect((set.data as { lines: { listed: string }[] }).lines.map((line) => line.listed)).toEqual([
      'Difference',
      "    Cube  '2, 2, 2'",
      "    Sphere  radius '1.2'",
      'End Difference',
    ]);
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

  it('set and read the values of the script inputs like the inspector', () => {
    const { api, objectId } = generatorFixture();
    const lines = [
      { command: 'input', values: { name: 'steps', type: 'count', default: '2', min: '1', max: '20' } },
      { command: 'repeat', values: { variable: 'i', from: '1', to: '[steps]' } },
      { command: 'cube' },
      { command: 'end' },
    ];
    const set = api.invokeTool('geometry_script_generator_set', { objectId, lines });
    expect(set.data).toMatchObject({
      solids: 2,
      inputs: [{ name: 'steps', type: 'count', default: '2', min: 1, max: 20, value: '2' }],
    });
    const changed = api.invokeTool('geometry_script_generator_set', { objectId, inputs: { steps: 5 } });
    expect(changed.data).toMatchObject({ solids: 5, inputs: [{ name: 'steps', value: '5' }] });
    const kept = api.invokeTool('geometry_script_generator_set', { objectId, name: 'Steps' });
    expect(kept.data).toMatchObject({ solids: 5 });
    const outside = api.invokeTool('geometry_script_generator_set', { objectId, inputs: { steps: 50 } });
    expect((outside.data as { error: string }).error).toMatch(/from 1 to 20, not 50/);
    const unknown = api.invokeTool('geometry_script_generator_set', { objectId, inputs: { width: 3 } });
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toMatch(/no Input width; inputs: steps/);
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
    for (const topic of ['Coordinates', 'Field values', '[=', 'Common mistakes', 'Examples', 'Cylinder', 'Use Part'])
      expect(text, topic).toContain(topic);
  });

  it('build every example of the reference as generator lines and as a new model', () => {
    const { api, objectId } = generatorFixture();
    const text = (api.invokeTool('geometry_script_reference_get', {}).data as { reference: string }).reference;
    const examples = [...text.matchAll(/```\n(\[[\s\S]*?)```/g)].map(
      (match) => JSON.parse(match[1] ?? '') as unknown[],
    );
    expect(examples.length).toBeGreaterThan(1);
    for (const lines of examples) {
      const set = api.invokeTool('geometry_script_generator_set', { objectId, lines });
      expect(set.ok, set.message).toBe(true);
      expect((set.data as { error: string }).error).toBe('');
      const built = api.invokeTool('geometry_script_build', { lines });
      expect(built.ok, built.message).toBe(true);
    }
  });

  it('list the reference example the way the editor shows it', () => {
    const { api, objectId } = generatorFixture();
    const text = (api.invokeTool('geometry_script_reference_get', {}).data as { reference: string }).reference;
    const columns = [...text.matchAll(/```\n(\[[\s\S]*?)```/g)][1]?.[1] ?? '';
    const set = api.invokeTool('geometry_script_generator_set', { objectId, lines: JSON.parse(columns) as unknown[] });
    const listed = (set.data as { lines: { listed: string }[] }).lines.map((line) => line.listed);
    expect(listed[0]).toBe('::  column');
    expect(listed.at(-1)).toBe('End Repeat');
    expect(text).toContain(listed.join('\n'));
  });

  it('send every agent to the reference before its first script', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('Read geometry_script_reference_get once first');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('list of block lines {command, values}');
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
