import { describe, expect, it } from 'vitest';
import { listSolidModels } from '@/ai/client/editor_api_lookup.js';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

const ROOM = `
module wall() cube([4, 0.2, 3]);
module doorway() translate([1.5, -0.1, 0]) cube([1, 0.4, 2.1]);
difference() { wall(); doorway(); }
`;

describe('geometry tools', () => {
  it('builds OpenSCAD into a new model with a carved group as one undo step', () => {
    const { api, world, stack } = editorApiFixtureCreate();
    const result = api.invokeTool('geometry_scad_build', { source: ROOM, name: 'Room' });
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
    const result = api.invokeTool('geometry_scad_build', {
      source: 'cube(0.5, center = true);',
      modelId,
      operation: 'subtractive',
      name: 'Hole',
    });
    expect(result.ok, result.message).toBe(true);
    const brushes = listSolidModels(world)[0]?.getBrushes() ?? [];
    expect(brushes.at(-1)?.operation).toBe(1);
    expect(brushes.at(-1)?.name).toMatch(/^Hole cube\./);
  });

  it('previews without changing the scene and reports source errors', () => {
    const { api, world } = editorApiFixtureCreate();
    const preview = api.invokeTool('geometry_scad_preview', { source: ROOM });
    expect(preview.ok).toBe(true);
    expect(JSON.stringify(preview.data)).toContain('"group":"difference"');
    expect(listSolidModels(world)).toHaveLength(0);
    const failed = api.invokeTool('geometry_scad_build', { source: 'cube(1' });
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/OpenSCAD: line 1/);
  });
});
