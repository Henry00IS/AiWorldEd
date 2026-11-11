import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorApi } from '@/ai/client/editor_api.js';
import type { EditorApiHost } from '@/ai/client/editor_api_host.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidModelCreate } from '@/solid/commands/model/command_solid_model_create.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { isSolidCsgGroup, getSolidGroupOperation } from '@/solid/model/solid_group.js';

/**
 * Builds a minimal EditorApiHost for hierarchy unit tests.
 *
 * @param worldObject World group.
 * @param commandStack Command stack.
 * @param selectionManager Selection manager.
 * @returns Host bag.
 */
function createTestHost(
  worldObject: THREE.Group,
  commandStack: CommandStack,
  selectionManager: ManagerSelection,
): EditorApiHost {
  const panelHost = document.createElement('div');
  const panel = new SolidModelPanel(panelHost, { onAddBoxBrush: () => undefined });
  const solidModelController = new SolidModelController(worldObject, commandStack, selectionManager, panel);
  const gridSnap = new GridSnap(true, 0.25);
  const snapManager = new ManagerSnap(0.25);
  return {
    worldObject,
    commandStack,
    selectionManager,
    solidModelController,
    gridSnap,
    snapManager,
    getUserSnapEnabled: () => false,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
  };
}

/**
 * Creates a solid model with two additive brushes under the world.
 *
 * @returns Setup bundle.
 */
function createModelWithTwoBrushes(): {
  api: EditorApi;
  model: SolidModel;
  brushA: string;
  brushB: string;
  stack: CommandStack;
} {
  const world = new THREE.Group();
  const stack = new CommandStack(64);
  const selection = new ManagerSelection();
  const api = new EditorApi(createTestHost(world, stack, selection));
  const model = new SolidModel('HierarchyModel');
  const a = model.addBoxBrush(1, SolidOperation.Additive);
  const b = model.addBoxBrush(1, SolidOperation.Additive);
  stack.push(new CommandSolidModelCreate(model, world));
  return { api, model, brushA: a.id, brushB: b.id, stack };
}

/** Unit tests for solid CSG hierarchy MCP tools. */
describe('EditorApi solid hierarchy', () => {
  it('creates a CSG group from brushes and reports hierarchy nesting', () => {
    const { api, model, brushA, brushB } = createModelWithTwoBrushes();
    const created = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA, brushB],
      name: 'Compound',
      operation: 'subtractive',
    });
    expect(created.ok).toBe(true);
    const groupId = (created.data as { groupId: string }).groupId;
    expect(groupId).toBeTruthy();
    const group = model.root.children.find((child) => child.uuid === groupId);
    expect(group).toBeDefined();
    expect(isSolidCsgGroup(group!)).toBe(true);
    expect(getSolidGroupOperation(group!)).toBe(SolidOperation.Subtractive);
    const detail = api.invokeTool('get_solid_model', { modelId: model.root.uuid });
    expect(detail.ok).toBe(true);
    const data = detail.data as {
      hierarchy: Array<{ kind: string; id: string; operation?: string; children: unknown[] }>;
      brushes: Array<{ brushId: string; parentGroupId: string | null }>;
    };
    expect(data.hierarchy.some((node) => node.kind === 'csg_group' && node.id === groupId)).toBe(true);
    expect(data.brushes.every((brush) => brush.parentGroupId === groupId)).toBe(true);
    const groupDetail = api.invokeTool('get_csg_group', { groupId });
    expect(groupDetail.ok).toBe(true);
    const summary = groupDetail.data as {
      operation: string;
      childBrushIds: string[];
      parentGroupId: string | null;
    };
    expect(summary.operation).toBe('subtractive');
    expect(summary.childBrushIds.sort()).toEqual([brushA, brushB].sort());
    expect(summary.parentGroupId).toBeNull();
  });

  it('adds a box under a parent group and reparents between groups', () => {
    const { api, model, brushA, brushB } = createModelWithTwoBrushes();
    const outer = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA],
      name: 'Outer',
    });
    const outerId = (outer.data as { groupId: string }).groupId;
    const added = api.invokeTool('add_box_brush', {
      modelId: model.root.uuid,
      parentGroupId: outerId,
      name: 'Nested',
      size: 1,
      snap: false,
    });
    expect(added.ok).toBe(true);
    const nestedId = (added.data as { brushId: string }).brushId;
    const brush = model.findBrush(nestedId);
    expect(brush?.mesh?.parent?.uuid).toBe(outerId);
    const inner = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushB],
      name: 'Inner',
    });
    const innerId = (inner.data as { groupId: string }).groupId;
    const reparent = api.invokeTool('reparent_solid_nodes', {
      nodeIds: [innerId],
      parentId: outerId,
    });
    expect(reparent.ok).toBe(true);
    const nestedGroup = model.root.getObjectByProperty('uuid', innerId);
    expect(nestedGroup?.parent?.uuid).toBe(outerId);
    const tree = api.invokeTool('get_scene_hierarchy');
    expect(tree.ok).toBe(true);
  });

  it('duplicates a CSG group with nested brushes and can ungroup', () => {
    const { api, model, brushA, brushB } = createModelWithTwoBrushes();
    const created = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA, brushB],
      name: 'ToCopy',
    });
    const groupId = (created.data as { groupId: string }).groupId;
    const beforeCount = model.getBrushCount();
    const duplicated = api.invokeTool('duplicate_brushes', {
      groupIds: [groupId],
      offset: { x: 2, y: 0, z: 0 },
    });
    expect(duplicated.ok).toBe(true);
    expect(model.getBrushCount()).toBe(beforeCount * 2);
    const data = duplicated.data as { groupIds: string[]; brushIds: string[] };
    expect(data.groupIds.length).toBe(1);
    expect(data.brushIds.length).toBe(2);
    const ungrouped = api.invokeTool('ungroup_csg_groups', { groupIds: [groupId] });
    expect(ungrouped.ok).toBe(true);
    expect(model.root.children.some((child) => child.uuid === groupId)).toBe(false);
  });

  it('sets group operation via set_group_operation', () => {
    const { api, model, brushA } = createModelWithTwoBrushes();
    const created = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA],
      name: 'Ops',
      operation: 'additive',
    });
    const groupId = (created.data as { groupId: string }).groupId;
    const result = api.invokeTool('set_group_operation', {
      groupIds: [groupId],
      operation: 'intersecting',
    });
    expect(result.ok).toBe(true);
    const group = model.root.children.find((child) => child.uuid === groupId)!;
    expect(getSolidGroupOperation(group)).toBe(SolidOperation.Intersecting);
  });

  it('rejects create_csg_group when parentGroupId is a member (no hang)', () => {
    const { api, model, brushA } = createModelWithTwoBrushes();
    const outer = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA],
      name: 'Outer',
    });
    const outerId = (outer.data as { groupId: string }).groupId;
    const bad = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      groupIds: [outerId],
      parentGroupId: outerId,
      name: 'Cycle',
    });
    expect(bad.ok).toBe(false);
    expect(bad.message.toLowerCase()).toContain('parentgroupid');
  });

  it('rejects create_csg_group when parent is nested under a member', () => {
    const { api, model, brushA, brushB } = createModelWithTwoBrushes();
    const outer = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA],
      name: 'Outer',
    });
    const outerId = (outer.data as { groupId: string }).groupId;
    const inner = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushB],
      name: 'Inner',
      parentGroupId: outerId,
    });
    const innerId = (inner.data as { groupId: string }).groupId;
    expect(inner.ok).toBe(true);
    const bad = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      groupIds: [outerId],
      parentGroupId: innerId,
      name: 'BadNest',
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects invalid create_csg_group operation', () => {
    const { api, model, brushA } = createModelWithTwoBrushes();
    const bad = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA],
      operation: 'not_a_real_op',
    });
    expect(bad.ok).toBe(false);
    expect(bad.message.toLowerCase()).toContain('operation');
  });

  it('renames a group undoably', () => {
    const { api, model, brushA, stack } = createModelWithTwoBrushes();
    const created = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA],
      name: 'Before',
    });
    const groupId = (created.data as { groupId: string }).groupId;
    const undoBeforeRename = stack.getUndoCount();
    const renamed = api.invokeTool('rename_group', { groupId, name: 'After' });
    expect(renamed.ok).toBe(true);
    expect(stack.getUndoCount()).toBe(undoBeforeRename + 1);
    const group = model.root.children.find((child) => child.uuid === groupId);
    expect(group?.name).toBe('After');
    const undone = api.invokeTool('undo');
    expect(undone.ok).toBe(true);
    expect(group?.name).toBe('Before');
  });

  it('exposes group ids separately from createdIds on duplicate', () => {
    const { api, model, brushA, brushB } = createModelWithTwoBrushes();
    const created = api.invokeTool('create_csg_group', {
      modelId: model.root.uuid,
      brushIds: [brushA, brushB],
      name: 'CopyMe',
    });
    const groupId = (created.data as { groupId: string }).groupId;
    const duplicated = api.invokeTool('duplicate_brushes', {
      groupIds: [groupId],
      offset: { x: 3, y: 0, z: 0 },
    });
    expect(duplicated.ok).toBe(true);
    const data = duplicated.data as { groupIds: string[]; brushIds: string[] };
    expect(data.groupIds.length).toBe(1);
    expect(data.brushIds.length).toBe(2);
    expect(duplicated.createdIds).toEqual(data.brushIds);
    expect(duplicated.createdIds).not.toContain(data.groupIds[0]);
  });
});
