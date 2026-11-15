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
 * Builds write API fixture.
 *
 * @returns Api, world, stack.
 */
function createApi(): { api: EditorApi; world: THREE.Group; stack: CommandStack } {
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
    getUserSnapEnabled: () => false,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
  };
  return { api: new EditorApi(host), world, stack };
}

/** Clip world-plane + CSG vs AABB regression tests. */
describe('clip world plane and CSG vs AABB', () => {
  it('clips a translated brush at its world midplane', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('ClipShift');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.position.set(5, 0, 0);
    brush.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('brush_clip', {
      brushId: brush.id,
      axis: 'x',
      distance: 5,
      frontKeep: false,
    });
    expect(result.ok).toBe(true);
    const updated = model.findBrush(brush.id)!;
    const bounds = updated.brush.computeLocalBounds();
    expect(bounds.max.x).toBeLessThanOrEqual(0.01);
  });

  it('clips when the solid model root is offset in the world', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('ClipModelRoot');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.root.position.set(10, 0, 0);
    model.root.updateMatrixWorld(true);
    brush.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('brush_clip', {
      brushId: brush.id,
      axis: 'x',
      distance: 10,
      frontKeep: false,
    });
    expect(result.ok).toBe(true);
    const updated = model.findBrush(brush.id)!;
    expect(updated.brush.computeLocalBounds().max.x).toBeLessThanOrEqual(0.01);
  });

  it('AABB space_point_query hits subtractives while explain_csg reports void', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('CsgPoint');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    cutter.position.set(0, 0, 0);
    cutter.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CommandSolidModelCreate(model, world));
    const aabb = api.invokeTool('space_point_query', { point: { x: 0, y: 0, z: 0 }, modelId: model.root.uuid });
    const csg = api.invokeTool('space_solid_point_explain', {
      point: { x: 0, y: 0, z: 0 },
      modelId: model.root.uuid,
    });
    expect(aabb.ok).toBe(true);
    expect(csg.ok).toBe(true);
    const brushIds = (aabb.data as { brushIds: string[] }).brushIds;
    expect(brushIds).toContain(outer.id);
    expect(brushIds).toContain(cutter.id);
    expect((csg.data as { finalSolid: boolean }).finalSolid).toBe(false);
  });

  it('solid_model_validate warns when a subtractive misses additive solid', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('OrphanCut');
    model.addBoxBrush(1, SolidOperation.Additive);
    const floating = model.addBoxBrush(1, SolidOperation.Subtractive);
    floating.position.set(50, 0, 0);
    floating.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CommandSolidModelCreate(model, world));
    const result = api.invokeTool('solid_model_validate', { modelId: model.root.uuid });
    expect(result.ok).toBe(true);
    const warnings = (result.data as { warnings: string[] }).warnings;
    expect(warnings.some((text) => text.includes(floating.id) || text.includes('does not overlap'))).toBe(true);
  });
});
