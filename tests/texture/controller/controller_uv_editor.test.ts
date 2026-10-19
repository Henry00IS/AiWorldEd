import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ControllerUvEditor } from '@/texture/controller/controller_uv_editor.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

describe('UvEditorController', () => {
  let scene: THREE.Scene;
  let world: THREE.Group;
  let objectSelection: ManagerSelection;
  let faceController: ControllerFaceExtrusion;
  let commandStack: CommandStack;
  let controller: ControllerUvEditor;

  beforeEach(() => {
    scene = new THREE.Scene();
    world = new THREE.Group();
    objectSelection = new ManagerSelection();
    commandStack = new CommandStack(64);
    const gridSnap = new GridSnap(false, 1);
    faceController = new ControllerFaceExtrusion(scene, commandStack, gridSnap, world);
    controller = new ControllerUvEditor(objectSelection, faceController, commandStack);
  });

  it('should report zero targets when nothing is selected', () => {
    const uiRefresh = vi.fn();
    controller.setUiRefreshCallback(uiRefresh);
    controller.refreshFromSelection();
    expect(uiRefresh).toHaveBeenCalled();
    const fields = uiRefresh.mock.calls[0]![0]!;
    expect(fields.targetCount).toBe(0);
  });

  it('should refresh UI with face region count after face selection', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    faceController.setAvailableMeshes([mesh]);
    faceController.setSelectionMode(SelectionMode.FACE);
    const uiRefresh = vi.fn();
    controller.setUiRefreshCallback(uiRefresh);
    faceController.setFaceSelectionChangedCallback(() => {
      controller.refreshFromSelection();
    });
    faceController.selectFace(mesh, 0, false);
    expect(uiRefresh).toHaveBeenCalled();
    const lastCall = uiRefresh.mock.calls[uiRefresh.mock.calls.length - 1]!;
    expect(lastCall[0].targetCount).toBeGreaterThan(0);
  });

  it('leaves a selected bevel volume unchanged', () => {
    const volume = ModifierVolumeBevel.create();
    const material = volume.material;
    const positions = volume.geometry.getAttribute('position').count;
    objectSelection.selectObject(volume);
    faceController.setSelectionMode(SelectionMode.OBJECT);
    controller.applyRelativeOp({ kind: 'multiplyScale', axis: 'u', factor: 2 });
    expect(commandStack.getUndoCount()).toBe(0);
    expect(volume.material).toBe(material);
    expect(volume.geometry.getAttribute('position').count).toBe(positions);
    expect(getFaceTextureMaps(volume)).toEqual([]);
  });

  it('edits other selected meshes and skips a bevel volume', () => {
    const volume = ModifierVolumeBevel.create();
    const material = volume.material;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    objectSelection.setSelection([mesh, volume]);
    faceController.setSelectionMode(SelectionMode.OBJECT);
    controller.applyRelativeOp({ kind: 'multiplyScale', axis: 'u', factor: 2 });
    expect(commandStack.getUndoCount()).toBe(1);
    expect(volume.material).toBe(material);
    expect(getFaceTextureMaps(volume)).toEqual([]);
    expect(getFaceTextureMaps(mesh).length).toBeGreaterThan(0);
  });

  it('reports no UV targets when only a bevel volume is selected', () => {
    const uiRefresh = vi.fn();
    controller.setUiRefreshCallback(uiRefresh);
    objectSelection.selectObject(ModifierVolumeBevel.create());
    faceController.setSelectionMode(SelectionMode.OBJECT);
    controller.refreshFromSelection();
    const fields = uiRefresh.mock.calls[0]?.[0];
    expect(fields?.targetCount).toBe(0);
  });
});
