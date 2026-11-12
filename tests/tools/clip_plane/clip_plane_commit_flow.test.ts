import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';

/**
 * Builds a unit box mesh parented under the world for clip tests.
 *
 * @param world World root.
 * @returns Mesh ready to clip.
 */
function addBoxMesh(world: THREE.Group): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  world.add(mesh);
  return mesh;
}

/**
 * Places a vertical cut plane through the origin on the active tool.
 *
 * @param tool Clip plane tool.
 */
function placeVerticalPlane(tool: ToolClipPlane): void {
  tool.activate();
  tool.addPoint(new THREE.Vector3(0, 0, -1));
  tool.addPoint(new THREE.Vector3(0, 0, 1));
  expect(tool.isPlaneReady()).toBe(true);
}

/** Unit tests for continuous clip/split workflow after commit. */
describe('ClipPlaneHandler continuous commit flow', () => {
  let worldObject: THREE.Group;
  let clipPlaneTool: ToolClipPlane;
  let selectionManager: ManagerSelection;
  let handler: HandlerClipPlane;
  let showStatusMessage: ReturnType<typeof vi.fn<(message: string) => void>>;

  beforeEach(() => {
    worldObject = new THREE.Group();
    clipPlaneTool = new ToolClipPlane();
    selectionManager = new ManagerSelection();
    showStatusMessage = vi.fn<(message: string) => void>();
    handler = new HandlerClipPlane({
      worldObject,
      commandStack: new CommandStack(32),
      selectionManager,
      gridSnap: new GridSnap(false, 1),
      clipPlaneTool,
      modalToolSessionRegistry: { runWithSelectionEndSuppressed: (work: () => void) => work() } as never,
      showStatusMessage,
      syncPrimitivesToViewports: vi.fn(),
      refreshOutliner: vi.fn(),
      updateShadingMeshes: vi.fn(),
      onToolStateChanged: vi.fn(),
    });
  });

  it('keeps the clip tool active and clears placement after a successful clip', () => {
    const mesh = addBoxMesh(worldObject);
    selectionManager.selectObject(mesh);
    placeVerticalPlane(clipPlaneTool);
    handler.commitClip();
    expect(clipPlaneTool.isActive()).toBe(true);
    expect(clipPlaneTool.getPoints()).toHaveLength(0);
    expect(clipPlaneTool.isPlaneReady()).toBe(false);
    const selected = selectionManager.getAllSelectedObjectsAsArray();
    expect(selected.length).toBe(1);
    expect(selected[0]!).not.toBe(mesh);
    expect(selected[0]!.parent).toBe(worldObject);
  });

  it('selects both split halves and allows another plane to be placed', () => {
    const mesh = addBoxMesh(worldObject);
    selectionManager.selectObject(mesh);
    placeVerticalPlane(clipPlaneTool);
    handler.commitSplit();
    expect(clipPlaneTool.isActive()).toBe(true);
    const selected = selectionManager.getAllSelectedObjectsAsArray();
    expect(selected.length).toBe(2);
    selected.forEach((piece) => {
      expect(piece.parent).toBe(worldObject);
    });
    clipPlaneTool.addPoint(new THREE.Vector3(0.25, 0, -1));
    clipPlaneTool.addPoint(new THREE.Vector3(0.25, 0, 1));
    expect(clipPlaneTool.isPlaneReady()).toBe(true);
    handler.commitClip();
    expect(clipPlaneTool.isActive()).toBe(true);
    expect(selectionManager.getAllSelectedObjectsAsArray().length).toBeGreaterThan(0);
  });

  it('resetPlacementForNextCut preserves keep-front preference', () => {
    clipPlaneTool.activate();
    clipPlaneTool.addPoint(new THREE.Vector3(0, 0, 0));
    clipPlaneTool.addPoint(new THREE.Vector3(1, 0, 0));
    clipPlaneTool.flipKeepSide();
    expect(clipPlaneTool.getKeepFront()).toBe(false);
    clipPlaneTool.resetPlacementForNextCut();
    expect(clipPlaneTool.isActive()).toBe(true);
    expect(clipPlaneTool.getKeepFront()).toBe(false);
    expect(clipPlaneTool.getPoints()).toHaveLength(0);
  });

  it('never clips volume or generator boxes, only the brushes and meshes beside them', () => {
    const volume = ModifierVolume.create({});
    const generator = modifierGeneratorNodeCreate('column');
    worldObject.add(volume, generator);
    const geometries = [volume.geometry, generator.geometry];
    selectionManager.setSelection([volume, generator]);
    placeVerticalPlane(clipPlaneTool);
    handler.commitSplit();
    expect(showStatusMessage).toHaveBeenLastCalledWith('Select a mesh to clip');
    expect(clipPlaneTool.getPoints()).toHaveLength(2);
    const mesh = addBoxMesh(worldObject);
    selectionManager.setSelection([volume, mesh, generator]);
    handler.commitClip();
    expect(showStatusMessage).toHaveBeenLastCalledWith('Clipped 1/1 · place points to cut again');
    expect([volume.parent, generator.parent]).toEqual([worldObject, worldObject]);
    expect(volume.geometry).toBe(geometries[0]);
    expect(generator.geometry).toBe(geometries[1]);
  });
});
