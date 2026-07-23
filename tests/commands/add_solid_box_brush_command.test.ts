import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { AddSolidBoxBrushCommand } from '../../src/commands/add_solid_box_brush_command.js';

/**
 * Add-box-brush history must restore ownership and list membership.
 */
describe('AddSolidBoxBrushCommand', () => {
  it('adds a brush and removes it on undo', () => {
    const model = new SolidModel('AddBrush');
    model.addBoxBrush(2, SolidOperation.Additive);
    const command = new AddSolidBoxBrushCommand(
      model,
      2,
      SolidOperation.Subtractive,
      new THREE.Vector3(1, 0, 0)
    );
    command.execute();
    const created = command.getCreatedBrush();
    expect(created).toBeTruthy();
    expect(model.getBrushCount()).toBe(2);
    expect(created!.position.x).toBeCloseTo(1);
    expect(created!.operation).toBe(SolidOperation.Subtractive);
    command.undo();
    expect(model.getBrushCount()).toBe(1);
    expect(model.findBrush(created!.id)).toBeUndefined();
  });

  it('re-inserts the same brush on redo', () => {
    const model = new SolidModel('AddBrushRedo');
    const command = new AddSolidBoxBrushCommand(
      model,
      2,
      SolidOperation.Additive,
      new THREE.Vector3()
    );
    command.execute();
    const createdId = command.getCreatedBrush()!.id;
    command.undo();
    command.execute();
    expect(model.findBrush(createdId)).toBeDefined();
    expect(model.getBrushCount()).toBe(1);
  });
});
