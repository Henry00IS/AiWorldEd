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
 * Builds EditorApi with a pole and a flag-like brush.
 *
 * @returns Api, model id, and brush ids.
 */
function createPoleFlagFixture(): {
  api: EditorApi;
  modelId: string;
  poleId: string;
  flagId: string;
  model: SolidModel;
} {
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
  const model = new SolidModel('FindModel');
  const pole = model.addBoxBrush(1, SolidOperation.Additive);
  pole.scale.set(0.4, 8, 0.4);
  pole.position.set(0, 4, 0);
  pole.pushTransformToMesh();
  model.renameBrush(pole.id, 'start_a_pole');
  const flag = model.addBoxBrush(1, SolidOperation.Additive);
  flag.scale.set(2, 0.15, 1.2);
  flag.position.set(5, 10, 0);
  flag.pushTransformToMesh();
  model.renameBrush(flag.id, 'start_a_flag');
  model.rebuild(true);
  stack.push(new CommandSolidModelCreate(model, world));
  return {
    api: new EditorApi(host),
    modelId: model.root.uuid,
    poleId: pole.id,
    flagId: flag.id,
    model,
  };
}

/** Unit tests for find/describe/align/preview MCP tools. */
describe('EditorApi find and align', () => {
  it('finds brushes by name substring and shape', () => {
    const { api } = createPoleFlagFixture();
    const byName = api.invokeTool('brush_find', { nameContains: 'flag' });
    expect(byName.ok).toBe(true);
    const named = (byName.data as { brushes: Array<{ name: string }> }).brushes;
    expect(named.some((row) => row.name.includes('flag'))).toBe(true);
    const poles = api.invokeTool('brush_find', { shape: 'pole' });
    expect(poles.ok).toBe(true);
    const poleRows = (poles.data as { brushes: Array<{ shape: string }> }).brushes;
    expect(poleRows.some((row) => row.shape === 'thin_pole')).toBe(true);
  });

  it('describes a pole in one line', () => {
    const { api, poleId } = createPoleFlagFixture();
    const result = api.invokeTool('brush_describe', { brushId: poleId });
    expect(result.ok).toBe(true);
    expect(result.message.toLowerCase()).toContain('pole');
  });

  it('aligns flag on top of pole', () => {
    const { api, poleId, flagId, model } = createPoleFlagFixture();
    const result = api.invokeTool('brush_align', {
      brushId: flagId,
      targetBrushId: poleId,
      mode: 'top',
      gap: 0,
      snap: false,
    });
    expect(result.ok).toBe(true);
    const flag = model.findBrush(flagId)!;
    const pole = model.findBrush(poleId)!;
    flag.pullTransformFromMesh();
    pole.pullTransformFromMesh();
    const flagBox = flag.getModelSpaceBounds();
    const poleBox = pole.getModelSpaceBounds();
    expect(flagBox.min.y).toBeCloseTo(poleBox.max.y, 2);
  });

  it('previews transform without applying', () => {
    const { api, flagId, model } = createPoleFlagFixture();
    const before = model.findBrush(flagId)!.position.clone();
    const result = api.invokeTool('brush_transform_preview', {
      brushId: flagId,
      position: { x: 1, y: 2, z: 3 },
      snap: false,
    });
    expect(result.ok).toBe(true);
    const data = result.data as { applied: boolean; center: { x: number } };
    expect(data.applied).toBe(false);
    model.findBrush(flagId)!.pullTransformFromMesh();
    expect(model.findBrush(flagId)!.position.x).toBeCloseTo(before.x);
    expect(data.center).toBeDefined();
  });
});
