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
 * Builds EditorApi with two known overlapping boxes.
 *
 * @returns Api and brush ids.
 */
function createSpatialFixture(): { api: EditorApi; modelId: string; outerId: string; cutterId: string } {
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
  const model = new SolidModel('SpatialModel');
  const outer = model.addBoxBrush(4, SolidOperation.Additive);
  const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
  cutter.position.set(0.5, 0, 0);
  cutter.pushTransformToMesh();
  model.rebuild(true);
  stack.push(new CommandSolidModelCreate(model, world));
  return {
    api: new EditorApi(host),
    modelId: model.root.uuid,
    outerId: outer.id,
    cutterId: cutter.id,
  };
}

/** Unit tests for EditorApi spatial tools. */
describe('EditorApi spatial', () => {
  it('detects overlapping brush AABBs and tags operations', () => {
    const { api, outerId, cutterId } = createSpatialFixture();
    const result = api.invokeTool('space_overlaps_query', { brushId: outerId });
    expect(result.ok).toBe(true);
    const data = result.data as {
      brushIds: string[];
      brushes: Array<{ brushId: string; operation: string }>;
      note: string;
    };
    expect(data.brushIds).toContain(cutterId);
    expect(data.brushes.some((hit) => hit.brushId === cutterId && hit.operation === 'subtractive')).toBe(true);
    expect(data.note.toLowerCase()).toContain('aabb');
  });

  it('finds brush volumes at a point including subtractives, without claiming CSG solid', () => {
    const { api, outerId, cutterId } = createSpatialFixture();
    const result = api.invokeTool('space_point_query', { point: { x: 0, y: 0, z: 0 } });
    expect(result.ok).toBe(true);
    const data = result.data as {
      brushIds: string[];
      brushes: Array<{ brushId: string; operation: string }>;
      note: string;
    };
    expect(data.brushIds).toContain(outerId);
    expect(data.brushIds).toContain(cutterId);
    expect(data.brushes.find((hit) => hit.brushId === cutterId)?.operation).toBe('subtractive');
    expect(data.note.toLowerCase()).toContain('space_solid_point_explain');
  });

  it('measures brush size from world bounds', () => {
    const { api, outerId } = createSpatialFixture();
    const result = api.invokeTool('space_distance_measure', { brushId: outerId });
    expect(result.ok).toBe(true);
    const size = (result.data as { size: { x: number; y: number; z: number } }).size;
    expect(size.x).toBeGreaterThan(3.5);
    expect(size.y).toBeGreaterThan(3.5);
    expect(size.z).toBeGreaterThan(3.5);
  });

  it('validates a factory box brush', () => {
    const { api, outerId } = createSpatialFixture();
    const result = api.invokeTool('brush_validate', { brushId: outerId });
    expect(result.ok).toBe(true);
  });
});
