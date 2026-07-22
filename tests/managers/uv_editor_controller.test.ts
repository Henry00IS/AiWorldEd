import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { UvEditorController } from '../../src/managers/uv_editor_controller.js';
import { FaceExtrusionController } from '../../src/managers/face_extrusion_controller.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { GridSnap } from '../../src/transform/grid_snap.js';
import { SelectionMode } from '../../src/types/selection_mode.js';

describe('UvEditorController', () => {
  let scene: THREE.Scene;
  let world: THREE.Group;
  let objectSelection: SelectionManager;
  let faceController: FaceExtrusionController;
  let commandStack: CommandStack;
  let controller: UvEditorController;

  beforeEach(() => {
    scene = new THREE.Scene();
    world = new THREE.Group();
    objectSelection = new SelectionManager();
    commandStack = new CommandStack(64);
    const gridSnap = new GridSnap(false, 1);
    faceController = new FaceExtrusionController(
      scene,
      commandStack,
      gridSnap,
      world
    );
    controller = new UvEditorController(
      objectSelection,
      faceController,
      commandStack
    );
  });

  it('should report zero targets when nothing is selected', () => {
    const uiRefresh = vi.fn();
    controller.setUiRefreshCallback(uiRefresh);
    controller.refreshFromSelection();
    expect(uiRefresh).toHaveBeenCalledWith(null, 0);
  });

  it('should refresh UI with face region count after face selection', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    faceController.setAvailableMeshes([mesh]);
    faceController.setSelectionMode(SelectionMode.FACE);
    const uiRefresh = vi.fn();
    controller.setUiRefreshCallback(uiRefresh);
    faceController.setFaceSelectionChangedCallback(() => {
      controller.refreshFromSelection();
    });
    faceController.selectFace(mesh, 0, false);
    expect(uiRefresh).toHaveBeenCalled();
    const lastCall = uiRefresh.mock.calls[uiRefresh.mock.calls.length - 1];
    expect(lastCall[1]).toBeGreaterThan(0);
  });
});
