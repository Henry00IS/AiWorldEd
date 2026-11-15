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

/**
 * Builds a write-capable EditorApi fixture.
 *
 * @returns Api, world, stack.
 */
function createWriteFixture(): { api: EditorApi; world: THREE.Group; stack: CommandStack } {
  const world = new THREE.Group();
  const stack = new CommandStack(64);
  const selection = new ManagerSelection();
  const panelHost = document.createElement('div');
  const panel = new SolidModelPanel(panelHost, { onAddBoxBrush: () => undefined });
  const solidModelController = new SolidModelController(world, stack, selection, panel);
  const host: EditorApiHost = {
    worldObject: world,
    commandStack: stack,
    selectionManager: selection,
    solidModelController,
    gridSnap: new GridSnap(true, 0.25),
    snapManager: new ManagerSnap(0.25),
    getUserSnapEnabled: () => true,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
  };
  return { api: new EditorApi(host), world, stack };
}

/** Unit tests for batch create, rename, snap bypass, and mirror. */
describe('EditorApi batch rename mirror snap', () => {
  it('adds named boxes in one batch call', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('BatchModel');
    model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const before = model.getBrushCount();
    const result = api.invokeTool('brush_boxes_add', {
      modelId: model.root.uuid,
      snap: false,
      brushes: [
        { size: { x: 1, y: 2, z: 1 }, position: { x: 1, y: 0, z: 0 }, name: 'pad_a' },
        { size: { x: 1, y: 2, z: 1 }, position: { x: 3, y: 0, z: 0 }, name: 'pad_b' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(model.getBrushCount()).toBe(before + 2);
    const names = model.getBrushes().map((brush) => brush.name);
    expect(names).toContain('pad_a');
    expect(names).toContain('pad_b');
  });

  it('renames a brush undoably', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('RenameModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const renamed = api.invokeTool('brush_rename', { brushId: brush.id, name: 'def_pad_nw' });
    expect(renamed.ok).toBe(true);
    expect(model.findBrush(brush.id)?.name).toBe('def_pad_nw');
    api.invokeTool('history_undo');
    expect(model.findBrush(brush.id)?.name).not.toBe('def_pad_nw');
  });

  it('bypasses snap when snap is false', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('ExactModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const exact = -17.125;
    const result = api.invokeTool('brush_transform_set', {
      brushId: brush.id,
      position: { x: exact, y: 0, z: 0 },
      snap: false,
    });
    expect(result.ok).toBe(true);
    brush.pullTransformFromMesh();
    expect(brush.position.x).toBeCloseTo(exact, 5);
  });

  it('batch sets several transforms', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('BatchXform');
    const a = model.addBoxBrush(1, SolidOperation.Additive);
    const b = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('brush_transforms_set', {
      snap: false,
      transforms: [
        { brushId: a.id, position: { x: 2, y: 0, z: 0 } },
        { brushId: b.id, position: { x: 4, y: 0, z: 0 } },
      ],
    });
    expect(result.ok).toBe(true);
    a.pullTransformFromMesh();
    b.pullTransformFromMesh();
    expect(a.position.x).toBeCloseTo(2);
    expect(b.position.x).toBeCloseTo(4);
  });

  it('mirrors a brush across X as a copy and negates yaw', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('MirrorModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    brush.position.set(5, 0, 0);
    brush.rotation.y = THREE.MathUtils.degToRad(30);
    brush.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CommandSolidModelCreate(model, world));
    const before = model.getBrushCount();
    const result = api.invokeTool('brush_mirror', {
      brushIds: [brush.id],
      axis: 'x',
      plane: 0,
      copy: true,
      snap: false,
    });
    expect(result.ok).toBe(true);
    expect(model.getBrushCount()).toBe(before + 1);
    const createdId = (result.createdIds ?? [])[0];
    expect(createdId).toBeTruthy();
    const clone = model.findBrush(createdId!)!;
    clone.pullTransformFromMesh();
    expect(clone.position.x).toBeCloseTo(-5, 3);
    expect(THREE.MathUtils.radToDeg(clone.rotation.y)).toBeCloseTo(-30, 2);
  });

  it('mirrors yaw as pi minus yaw across Z', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('MirrorZModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    brush.position.set(0, 0, 4);
    brush.rotation.y = THREE.MathUtils.degToRad(45);
    brush.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('brush_mirror', {
      brushIds: [brush.id],
      axis: 'z',
      plane: 0,
      copy: true,
      snap: false,
    });
    expect(result.ok).toBe(true);
    const createdId = (result.createdIds ?? [])[0]!;
    const clone = model.findBrush(createdId)!;
    clone.pullTransformFromMesh();
    expect(clone.position.z).toBeCloseTo(-4, 3);
    expect(THREE.MathUtils.radToDeg(clone.rotation.y)).toBeCloseTo(135, 2);
  });

  it('calculates expressions through the tool facade', () => {
    const { api } = createWriteFixture();
    const result = api.invokeTool('math_calculate', { expression: '20+(0.5*12)' });
    expect(result.ok).toBe(true);
    expect((result.data as { value: number }).value).toBe(26);
  });

  it('returns ranked neighbors with shape tags', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('NeighborModel');
    const pole = model.addBoxBrush(1, SolidOperation.Additive);
    pole.scale.set(0.4, 8, 0.4);
    pole.position.set(0, 4, 0);
    pole.pushTransformToMesh();
    const flag = model.addBoxBrush(1, SolidOperation.Additive);
    flag.scale.set(2, 0.15, 1);
    flag.position.set(0.5, 8, 0);
    flag.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('space_neighbors_query', {
      brushId: pole.id,
      radius: 20,
      limit: 1,
    });
    expect(result.ok).toBe(true);
    const neighbors = (result.data as { neighbors: Array<{ rank: number; shape: string; name: string }> }).neighbors;
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0]!.rank).toBe(1);
    expect(neighbors[0]!.shape).toBeTruthy();
  });
});
