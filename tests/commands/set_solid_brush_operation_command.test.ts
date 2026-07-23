import { describe, it, expect } from 'vitest';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SetSolidBrushOperationCommand } from '../../src/commands/set_solid_brush_operation_command.js';

/**
 * CSG operation changes must be undoable without leaving stale preview style.
 */
describe('SetSolidBrushOperationCommand', () => {
  it('changes operation and restores the prior value on undo', () => {
    const model = new SolidModel('OpSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new SetSolidBrushOperationCommand(
      [brush.mesh!],
      SolidOperation.Subtractive
    );
    command.execute();
    expect(model.findBrush(brush.id)?.operation).toBe(
      SolidOperation.Subtractive
    );
    command.undo();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Additive);
  });

  it('is a no-op when the operation is already active', () => {
    const model = new SolidModel('OpNoop');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new SetSolidBrushOperationCommand(
      [brush.mesh!],
      SolidOperation.Additive
    );
    command.execute();
    command.undo();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Additive);
  });
});
