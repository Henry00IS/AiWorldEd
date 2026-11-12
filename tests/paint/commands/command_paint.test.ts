import { describe, expect, it } from 'vitest';
import { CommandPaintClear } from '@/paint/commands/command_paint_clear.js';
import { CommandPaintStrokes } from '@/paint/commands/command_paint_strokes.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/**
 * Creates a model with one box brush.
 *
 * @returns Model and brush.
 */
function modelWithBrush(): { model: SolidModel; brush: SolidBrushInstance } {
  const model = new SolidModel('Paint');
  const brush = model.addBoxBrush(4, SolidOperation.Additive);
  return { model, brush };
}

describe('paint commands', () => {
  it('adds and removes a stroke by id', () => {
    const { model, brush } = modelWithBrush();
    const stroke = testFloorStroke('s1', 0, [[0, 0.5, 0]]);
    const command = new CommandPaintStrokes([{ model, brushId: brush.id, stroke }]);
    command.execute();
    expect(brush.paint.get('s1')).toBe(stroke);
    command.undo();
    expect(brush.paint.isEmpty()).toBe(true);
    command.execute();
    expect(brush.paint.get('s1')).toBe(stroke);
  });

  it('still applies after the brush instance was replaced', () => {
    const { model, brush } = modelWithBrush();
    const stroke = testFloorStroke('s1', 0, [[0, 0.5, 0]]);
    const command = new CommandPaintStrokes([{ model, brushId: brush.id, stroke }]);
    command.execute();
    model.removeBrush(brush.id);
    const restored = brush.cloneWithId(brush.id, brush.name);
    model.addBrushInstance(restored);
    command.undo();
    expect(restored.paint.isEmpty()).toBe(true);
  });

  it('clears paint and restores it on undo', () => {
    const { model, brush } = modelWithBrush();
    brush.paint.add(testFloorStroke('s1', 0, [[0, 0.5, 0]]));
    brush.paint.add(testFloorStroke('s2', 1, [[1, 0.5, 0]]));
    const command = new CommandPaintClear([{ model, brushId: brush.id }]);
    expect(command.hasPaint()).toBe(true);
    command.execute();
    expect(brush.paint.isEmpty()).toBe(true);
    expect(command.hasPaint()).toBe(false);
    command.undo();
    expect(brush.paint.ordered().map((stroke) => stroke.id)).toEqual(['s1', 's2']);
  });
});
