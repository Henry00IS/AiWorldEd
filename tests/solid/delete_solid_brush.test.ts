import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { DeleteSolidBrushesCommand } from '../../src/commands/delete_solid_brushes_command.js';

/**
 * Deleting a brush must drop it from the solid model CSG list and rebuild.
 */
describe('Delete solid brushes', () => {
  it('removes the brush from the solid model and updates the result mesh', () => {
    const model = new SolidModel('DelSolid');
    const keep = model.addBoxBrush(4, SolidOperation.Additive);
    const remove = model.addBoxBrush(2, SolidOperation.Subtractive);
    remove.mesh!.position.set(0.5, 0, 0);
    remove.pushTransformToMesh();
    model.rebuild(true);
    const beforeCount = model
      .getResultMesh()
      .geometry.getAttribute('position').count;
    expect(model.getBrushCount()).toBe(2);
    const command = new DeleteSolidBrushesCommand([remove.mesh!]);
    command.execute();
    expect(model.getBrushCount()).toBe(1);
    expect(model.findBrush(remove.id)).toBeUndefined();
    expect(model.findBrush(keep.id)).toBeDefined();
    expect(remove.mesh!.parent).toBeNull();
    const afterCount = model
      .getResultMesh()
      .geometry.getAttribute('position').count;
    expect(afterCount).not.toBe(beforeCount);
    expect(afterCount).toBeGreaterThan(0);
  });

  it('undo restores the brush into the solid model tree', () => {
    const model = new SolidModel('DelUndo');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Subtractive);
    const command = new DeleteSolidBrushesCommand([second.mesh!]);
    command.execute();
    expect(model.getBrushCount()).toBe(1);
    command.undo();
    expect(model.getBrushCount()).toBe(2);
    expect(model.findBrush(second.id)).toBeDefined();
    expect(second.mesh!.parent).toBe(model.root);
    expect(model.findBrush(brush.id)).toBeDefined();
  });

  it('undo restores a middle brush at its original CSG list index', () => {
    const model = new SolidModel('DelOrder');
    const first = model.addBoxBrush(4, SolidOperation.Additive);
    const middle = model.addBoxBrush(2, SolidOperation.Subtractive);
    const last = model.addBoxBrush(2, SolidOperation.Intersecting);
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      first.id,
      middle.id,
      last.id
    ]);
    const command = new DeleteSolidBrushesCommand([middle.mesh!]);
    command.execute();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      first.id,
      last.id
    ]);
    command.undo();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      first.id,
      middle.id,
      last.id
    ]);
    expect(model.getBrushes().map((brush) => brush.operation)).toEqual([
      SolidOperation.Additive,
      SolidOperation.Subtractive,
      SolidOperation.Intersecting
    ]);
  });
});
