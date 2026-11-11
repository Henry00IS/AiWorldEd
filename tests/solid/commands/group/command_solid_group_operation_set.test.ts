import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { CommandSolidGroupOperationSet } from '@/solid/commands/group/command_solid_group_operation_set.js';
import { CommandStack } from '@/commands/command_stack.js';

/** Unit tests for solid CSG group operation changes (partial rebuild path). */
describe('CommandSolidGroupOperationSet', () => {
  it('changes group operation and restores it on undo', () => {
    const model = new SolidModel('GroupOpUndo');
    model.addBoxBrush(6, SolidOperation.Additive);
    const child = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(child.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const stack = new CommandStack(8);
    stack.push(new CommandSolidGroupOperationSet([group], SolidOperation.Subtractive));
    expect(group.userData['solidGroupOperation']).toBe(SolidOperation.Subtractive);
    stack.undo();
    expect(group.userData['solidGroupOperation']).toBe(SolidOperation.Additive);
  });

  it('uses partial CSG when flipping a one-brush group among many non-touching brushes', () => {
    const brushCount = 80;
    const model = new SolidModel('GroupOpPartial');
    const brushes = [];
    for (let index = 0; index < brushCount; index++) {
      const brush = model.addBoxBrush(1.5, SolidOperation.Additive, null, false);
      brush.position.set((index % 20) * 4, Math.floor(index / 20) * 4, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    const cutter = brushes[0]!;
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(cutter.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const stack = new CommandStack(8);
    stack.push(new CommandSolidGroupOperationSet([group], SolidOperation.Subtractive));
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(brushCount / 2);
    expect(group.userData['solidGroupOperation']).toBe(SolidOperation.Subtractive);
  });

  it('flipping a one-brush group in a large flat map stays a partial recompile', () => {
    const brushCount = 400;
    const model = new SolidModel('GroupOpPerf');
    const brushes = [];
    for (let index = 0; index < brushCount; index++) {
      const brush = model.addBoxBrush(1.5, SolidOperation.Additive, null, false);
      brush.position.set((index % 40) * 4, Math.floor(index / 40) * 4, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    const cutter = brushes[3]!;
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    group.add(cutter.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    new CommandSolidGroupOperationSet([group], SolidOperation.Subtractive).execute();
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(16);
  }, 30_000);
});
