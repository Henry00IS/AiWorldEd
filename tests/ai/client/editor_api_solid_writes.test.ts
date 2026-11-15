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
 * Builds a minimal EditorApiHost for write tests.
 *
 * @returns Host and world references.
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

/** Unit tests for EditorApi solid write tools. */
describe('EditorApi solid writes', () => {
  it('creates a solid model and undoes it', () => {
    const { api, world, stack } = createWriteFixture();
    const created = api.invokeTool('solid_model_create', { name: 'ApiModel' });
    expect(created.ok).toBe(true);
    expect(world.children.some((child) => child.name === 'ApiModel')).toBe(true);
    const undone = api.invokeTool('history_undo');
    expect(undone.ok).toBe(true);
    expect(world.children.some((child) => child.name === 'ApiModel')).toBe(false);
    expect(stack.canRedo()).toBe(true);
  });

  it('adds a subtractive box brush and can undo', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('WriteModel');
    model.addBoxBrush(2, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const beforeCount = model.getBrushCount();
    const offset = 0.5;
    const added = api.invokeTool('brush_box_add', {
      modelId: model.root.uuid,
      size: 1,
      position: { x: offset, y: 0, z: 0 },
      operation: 'subtractive',
    });
    expect(added.ok).toBe(true);
    expect(model.getBrushCount()).toBe(beforeCount + 1);
    const last = model.getBrushes()[model.getBrushCount() - 1]!;
    expect(last.operation).toBe(SolidOperation.Subtractive);
    expect(last.position.x).toBeCloseTo(offset);
    api.invokeTool('history_undo');
    expect(model.getBrushCount()).toBe(beforeCount);
  });

  it('sets brush operation through an undoable command', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('OpModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const updated = api.invokeTool('brush_operation_set', {
      brushIds: [brush.id],
      operation: 'intersecting',
    });
    expect(updated.ok).toBe(true);
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Intersecting);
    api.invokeTool('history_undo');
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Additive);
  });

  it('sets brush transform and rebuilds without throwing', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('TransformModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const targetX = 3;
    const result = api.invokeTool('brush_transform_set', {
      brushId: brush.id,
      position: { x: targetX, y: 0, z: 0 },
    });
    expect(result.ok).toBe(true);
    brush.pullTransformFromMesh();
    expect(brush.position.x).toBeCloseTo(targetX);
  });

  it('snaps position on brush_transform_set when snap is enabled', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('SnapPosModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('brush_transform_set', {
      brushId: brush.id,
      position: { x: 0.3, y: 0, z: 0 },
    });
    expect(result.ok).toBe(true);
    brush.pullTransformFromMesh();
    expect(brush.position.x).toBeCloseTo(0.25);
  });

  it('rotates a brush in degrees around Y with rotation snap', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('RotateModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('brush_rotate', {
      brushId: brush.id,
      degrees: 37,
      axis: 'y',
    });
    expect(result.ok).toBe(true);
    brush.pullTransformFromMesh();
    const degreesY = THREE.MathUtils.radToDeg(brush.rotation.y);
    expect(degreesY).toBeCloseTo(30, 5);
    const data = result.data as { degreesAfter: number; transform: { rotationDegrees: { y: number } } };
    expect(data.degreesAfter).toBeCloseTo(30, 5);
    expect(data.transform.rotationDegrees.y).toBeCloseTo(30, 5);
  });

  it('sets absolute rotation degrees via brush_transform_set', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('AbsRotModel');
    const brush = model.addBoxBrush(1, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('brush_transform_set', {
      brushId: brush.id,
      rotationDegrees: { x: 0, y: 90, z: 0 },
    });
    expect(result.ok).toBe(true);
    brush.pullTransformFromMesh();
    expect(THREE.MathUtils.radToDeg(brush.rotation.y)).toBeCloseTo(90, 5);
  });

  it('clips a brush with an axis-aligned plane and can undo', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('ClipModel');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const beforeMaxX = brush.brush.computeLocalBounds().max.x;
    expect(beforeMaxX).toBeGreaterThan(0.5);
    const result = api.invokeTool('brush_clip', {
      brushId: brush.id,
      axis: 'x',
      distance: 0,
      frontKeep: false,
    });
    expect(result.ok).toBe(true);
    const updated = model.findBrush(brush.id);
    expect(updated).toBeTruthy();
    expect(updated!.brush.computeLocalBounds().max.x).toBeLessThanOrEqual(0.01);
    api.invokeTool('history_undo');
    const restored = model.findBrush(brush.id);
    expect(restored!.brush.computeLocalBounds().max.x).toBeCloseTo(beforeMaxX, 3);
  });

  it('splits a brush into two brushes', () => {
    const { api, world, stack } = createWriteFixture();
    const model = new SolidModel('SplitModel');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const beforeCount = model.getBrushCount();
    const result = api.invokeTool('brush_split', {
      brushId: brush.id,
      axis: 'x',
      distance: 0,
    });
    expect(result.ok).toBe(true);
    expect(model.getBrushCount()).toBe(beforeCount + 1);
    expect(model.findBrush(brush.id)).toBeUndefined();
    const createdIds = (result.data as { brushIds: string[] }).brushIds;
    expect(createdIds).toHaveLength(2);
  });
});
