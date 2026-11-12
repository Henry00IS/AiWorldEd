import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { paintSelectedBrushTargets } from '@/paint/layout/layout_paint_setup.js';

describe('paintSelectedBrushTargets', () => {
  it('returns a selected brush, or every brush of a selected model, once', () => {
    const model = new SolidModel('Room');
    const floor = model.addBoxBrush(4, SolidOperation.Additive);
    const wall = model.addBoxBrush(2, SolidOperation.Additive);
    expect(floor.mesh).not.toBeNull();
    const single = paintSelectedBrushTargets(floor.mesh === null ? [] : [floor.mesh]);
    expect(single.map((target) => target.brushId)).toEqual([floor.id]);
    const all = paintSelectedBrushTargets([model.root, ...(wall.mesh === null ? [] : [wall.mesh])]);
    expect(all.map((target) => target.brushId).sort()).toEqual([floor.id, wall.id].sort());
  });
});
