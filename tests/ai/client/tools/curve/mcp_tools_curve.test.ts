import { describe, expect, it } from 'vitest';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

/**
 * Creates a column generator and returns its curve target.
 *
 * @returns Fixture and target arguments.
 */
function columnTarget() {
  const fixture = editorApiFixtureCreate();
  const modelId = (fixture.api.invokeTool('solid_model_create', {}).data as { modelId: string }).modelId;
  const objectId = (
    fixture.api.invokeTool('modifier_generator_create', { kind: 'column', modelId }).data as { objectId: string }
  ).objectId;
  const stack = fixture.api.invokeTool('modifier_stack_get', { objectId }).data as {
    modifiers: { modifierId: string }[];
  };
  return { ...fixture, target: { objectId, modifierId: stack.modifiers[0]?.modifierId ?? '', key: 'profile' } };
}

type CurveData = {
  points: { x: number; y: number; handleOut: { x: number; y: number } }[];
  segments: { mode: string }[];
};

describe('curve tools', () => {
  it('reads the shown profile, draws it with an SVG path and undoes', () => {
    const { api, stack, target } = columnTarget();
    const read = api.invokeTool('curve_get', target);
    expect(read.ok, read.message).toBe(true);
    const before = JSON.stringify((read.data as { data: unknown }).data);
    const drawn = api.invokeTool('curve_path_set', {
      ...target,
      path: 'M0 0.8 L0.1 0.8 C0.2 0.8 0.2 0.5 0.3 0.5 L1 0.5',
    });
    expect(drawn.ok, drawn.message).toBe(true);
    const after = api.invokeTool('curve_get', target).data as CurveData;
    expect(after.points).toHaveLength(4);
    expect(after.segments.map((segment) => segment.mode)).toEqual(['linear', 'bezier', 'linear']);
    stack.undo();
    expect(JSON.stringify((api.invokeTool('curve_get', target).data as { data: unknown }).data)).toBe(before);
  });

  it('adds, moves with handles and deletes points, and sets segments', () => {
    const { api, target } = columnTarget();
    api.invokeTool('curve_path_set', { ...target, path: 'M0 0.5 L1 0.5' });
    expect(api.invokeTool('curve_point_add', { ...target, x: 0.5, y: 0.7 }).ok).toBe(true);
    const moved = api.invokeTool('curve_point_set', { ...target, index: 1, handleOut: { x: 0.6, y: 0.7 } });
    expect(moved.ok, moved.message).toBe(true);
    const curve = moved.data as CurveData;
    expect(curve.points[1]?.y).toBeCloseTo(0.7);
    expect(api.invokeTool('curve_segment_set', { ...target, indices: [0], mode: 'quadratic' }).ok).toBe(true);
    expect(api.invokeTool('curve_segment_set', { ...target, indices: [9], mode: 'linear' }).ok).toBe(false);
    expect(api.invokeTool('curve_point_delete', { ...target, index: 0 }).ok).toBe(false);
    expect(api.invokeTool('curve_point_delete', { ...target, index: 1 }).ok).toBe(true);
  });

  it('lists and applies presets, markers and reflections, and refuses unknown keys', () => {
    const { api, target } = columnTarget();
    const presets = (api.invokeTool('curve_preset_list', target).data as { presets: { id: string }[] }).presets;
    expect(presets.length).toBeGreaterThan(0);
    expect(api.invokeTool('curve_preset_apply', { ...target, presetId: presets[0]?.id }).ok).toBe(true);
    expect(api.invokeTool('curve_marker_set', { ...target, side: 'bottom', enabled: true, x: 0.2 }).ok).toBe(true);
    expect(api.invokeTool('curve_flip', target).ok).toBe(true);
    expect(api.invokeTool('curve_mirror', target).ok).toBe(true);
    const wrong = api.invokeTool('curve_get', { ...target, key: 'nope' });
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toMatch(/profile/);
  });
});
