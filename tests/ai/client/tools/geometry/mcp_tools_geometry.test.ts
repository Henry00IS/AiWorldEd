import { describe, expect, it } from 'vitest';
import { listSolidModels } from '@/ai/client/editor_api_lookup.js';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

/** A wall with a doorway, as command lines. */
const ROOM = [
  { command: 'part', values: { name: 'wall' } },
  { command: 'cube', values: { size: '4, 0.2, 3' } },
  { command: 'end' },
  { command: 'part', values: { name: 'doorway' } },
  { command: 'translate', values: { v: '0, 0, -0.45' } },
  { command: 'cube', values: { size: '1, 0.4, 2.1' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'difference' },
  { command: 'use_part', values: { name: 'wall' } },
  { command: 'use_part', values: { name: 'doorway' } },
  { command: 'end' },
];

describe('geometry tools', () => {
  it('builds a solid script into a new model with a carved group as one undo step', () => {
    const { api, world, stack } = editorApiFixtureCreate();
    const result = api.invokeTool('geometry_script_build', { lines: ROOM, name: 'Room' });
    expect(result.ok, result.message).toBe(true);
    const [model] = listSolidModels(world);
    expect(model?.root.name).toBe('Room');
    expect(model?.getBrushes().map((brush) => [brush.name.split('.')[0], brush.operation])).toEqual([
      ['wall', 0],
      ['doorway', 1],
    ]);
    stack.undo();
    expect(listSolidModels(world)).toHaveLength(0);
    stack.redo();
    expect(listSolidModels(world)[0]?.getBrushes()).toHaveLength(2);
  });

  it('carves into an existing model with a subtractive top-level operation', () => {
    const { api, world } = editorApiFixtureCreate();
    const created = api.invokeTool('solid_model_create', {});
    const modelId = (created.data as { modelId: string }).modelId;
    const result = api.invokeTool('geometry_script_build', {
      lines: [{ command: 'cube', values: { size: '0.5, 0.5, 0.5' } }],
      modelId,
      operation: 'subtractive',
      name: 'Hole',
    });
    expect(result.ok, result.message).toBe(true);
    const brushes = listSolidModels(world)[0]?.getBrushes() ?? [];
    expect(brushes.at(-1)?.operation).toBe(1);
    expect(brushes.at(-1)?.name).toMatch(/^Hole cube\./);
  });

  it('previews without changing the scene and reports line errors', () => {
    const { api, world } = editorApiFixtureCreate();
    const preview = api.invokeTool('geometry_script_preview', { lines: ROOM });
    expect(preview.ok).toBe(true);
    expect(JSON.stringify(preview.data)).toContain('"group":"difference"');
    expect(listSolidModels(world)).toHaveLength(0);
    const failed = api.invokeTool('geometry_script_build', {
      lines: [{ command: 'cube' }, { command: 'sphere', values: { r: '[size]' } }],
    });
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/^Script: line 2: Radius: there is no variable \[size\]/);
    expect(api.invokeTool('geometry_script_build', { source: 'cube(1);' }).ok).toBe(false);
  });
});
