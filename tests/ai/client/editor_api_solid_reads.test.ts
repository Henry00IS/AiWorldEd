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
 * Builds a minimal EditorApiHost for unit tests.
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
    getUserSnapEnabled: () => true,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
  };
}

/** Unit tests for EditorApi solid read tools. */
describe('EditorApi solid reads', () => {
  it('lists solid models created in the world', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(64);
    const selection = new ManagerSelection();
    const api = new EditorApi(createTestHost(world, stack, selection));
    const model = new SolidModel('ReadModel');
    const size = 2;
    model.addBoxBrush(size, SolidOperation.Additive);
    stack.push(new CommandSolidModelCreate(model, world));
    const listed = api.invokeTool('solid_model_list');
    expect(listed.ok).toBe(true);
    const models = (listed.data as { models: Array<{ name: string; brushCount: number }> }).models;
    expect(models.some((entry) => entry.name === 'ReadModel' && entry.brushCount === 1)).toBe(true);
  });

  it('returns ordered brushes for solid_model_get', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(64);
    const selection = new ManagerSelection();
    const api = new EditorApi(createTestHost(world, stack, selection));
    const model = new SolidModel('DetailModel');
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Subtractive);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('solid_model_get', { modelId: model.root.uuid });
    expect(result.ok).toBe(true);
    const detail = result.data as { brushes: Array<{ operation: string; orderIndex: number }> };
    expect(detail.brushes).toHaveLength(2);
    expect(detail.brushes[0]!.operation).toBe('additive');
    expect(detail.brushes[1]!.operation).toBe('subtractive');
    expect(detail.brushes[0]!.orderIndex).toBe(0);
  });

  it('returns editor context with right-handed Y-up coordinates', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(64);
    const selection = new ManagerSelection();
    const api = new EditorApi(createTestHost(world, stack, selection));
    const context = api.invokeTool('editor_context_get');
    expect(context.ok).toBe(true);
    const data = context.data as {
      handedness: string;
      upAxis: string;
      snap: { interval: number; rotationSnapDegrees: number };
    };
    expect(data.handedness).toBe('right');
    expect(data.upAxis).toBe('y');
    expect(data.snap.interval).toBe(0.25);
    expect(data.snap.rotationSnapDegrees).toBe(15);
  });
});
