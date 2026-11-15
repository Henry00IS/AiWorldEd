import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { getSolidGroupOperation, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { CommandSolidGroupOperationSet } from '@/solid/commands/group/command_solid_group_operation_set.js';
import { CommandStack } from '@/commands/command_stack.js';
import {
  layoutBox,
  layoutGroup,
  layoutModelBuild,
  meshSignature,
  type PassThroughLayoutNode,
} from '../../algorithm/compile/solid_csg_pass_through_fixture.js';

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

/**
 * Layouts for switching one group between additive and pass-through: a window
 * cutter that only reaches outside the group as pass-through, and an
 * intersecting brush that clips a distant wall once it joins the root.
 *
 * @returns Named layout builders taking the group operation.
 */
function passThroughSwitchLayouts(): Array<{
  name: string;
  nodes: (operation: SolidOperation) => PassThroughLayoutNode[];
}> {
  return [
    {
      name: 'window cutter',
      nodes: (operation) => [
        layoutBox([0, 0, 0], [6, 3, 0.5]),
        layoutGroup(operation, [layoutBox([0, 0, 0], [1.5, 1.5, 2], SolidOperation.Subtractive)]),
      ],
    },
    {
      name: 'intersecting clip of a distant wall',
      nodes: (operation) => [
        layoutBox([0, 0, 0], [4, 4, 4]),
        layoutBox([20, 0, 0], [2, 2, 2]),
        layoutGroup(operation, [layoutBox([1, 1, 1], [4, 4, 4], SolidOperation.Intersecting)]),
      ],
    },
  ];
}

/** Switching a group to and from pass-through rebuilds the result exactly. */
describe('CommandSolidGroupOperationSet pass-through', () => {
  for (const layout of passThroughSwitchLayouts()) {
    it(`matches a fresh build after switching and undoing: ${layout.name}`, () => {
      const { model, groups } = layoutModelBuild('Switch', layout.nodes(SolidOperation.Additive));
      const additive = meshSignature(model);
      const expected = meshSignature(layoutModelBuild('Fresh', layout.nodes(SolidOperation.PassThrough)).model);
      expect(expected.triangles).not.toEqual(additive.triangles);
      const stack = new CommandStack(8);
      stack.push(new CommandSolidGroupOperationSet(groups, SolidOperation.PassThrough));
      expect(getSolidGroupOperation(groups[0]!)).toBe(SolidOperation.PassThrough);
      expect(meshSignature(model).triangles).toEqual(expected.triangles);
      stack.undo();
      expect(getSolidGroupOperation(groups[0]!)).toBe(SolidOperation.Additive);
      expect(meshSignature(model).triangles).toEqual(additive.triangles);
      stack.redo();
      expect(meshSignature(model).triangles).toEqual(expected.triangles);
    });
  }
});
