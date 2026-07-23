import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { DuplicateSolidBrushesCommand } from '../../src/commands/duplicate_solid_brushes_command.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';

/**
 * Tests that solid brush duplication stays inside the solid model hierarchy.
 */
describe('Duplicate solid brushes', () => {
  it('duplicates a brush under the same solid model root', () => {
    const world = new THREE.Group();
    const model = new SolidModel('DupSolid');
    const source = model.addBoxBrush(2, SolidOperation.Additive);
    world.add(model.root);
    expect(source.mesh).toBeTruthy();
    const clone = model.duplicateBrush(source.id);
    expect(clone).toBeTruthy();
    expect(model.getBrushCount()).toBe(2);
    expect(clone!.mesh?.parent).toBe(model.root);
    expect(SolidBrushVisual.isBrushObject(clone!.mesh!)).toBe(true);
    expect(SolidModel.fromObject(clone!.mesh!)).toBe(model);
    expect(clone!.position.x).toBeCloseTo(source.position.x, 5);
    expect(clone!.position.y).toBeCloseTo(source.position.y, 5);
    expect(clone!.position.z).toBeCloseTo(source.position.z, 5);
  });

  it('undoes solid brush duplication via command', () => {
    const model = new SolidModel('CmdSolid');
    const source = model.addBoxBrush(2, SolidOperation.Subtractive);
    const command = new DuplicateSolidBrushesCommand(
      [source.mesh!],
      new THREE.Vector3(0, 0, 0)
    );
    command.execute();
    expect(model.getBrushCount()).toBe(2);
    expect(command.getClonedMeshes().length).toBe(1);
    command.undo();
    expect(model.getBrushCount()).toBe(1);
    expect(command.getClonedMeshes().length).toBe(0);
  });
});
