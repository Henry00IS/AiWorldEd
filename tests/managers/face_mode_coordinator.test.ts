import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { FaceModeCoordinator } from '../../src/managers/face_mode_coordinator.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { SelectionMode } from '../../src/types/selection_mode.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { GridSnap } from '../../src/transform/grid_snap.js';

/**
 * Minimal viewport stand-in for face mode coordinator wiring.
 */
class MockViewport {
  private camera: THREE.PerspectiveCamera;
  private renderer: { domElement: HTMLCanvasElement };
  private scene: THREE.Scene;
  faceSelectionCallback: ((event: MouseEvent) => boolean) | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera();
    this.renderer = { domElement: document.createElement('canvas') };
    this.scene = new THREE.Scene();
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer as unknown as THREE.WebGLRenderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  setFaceSelectionCallback(callback: (event: MouseEvent) => boolean): void {
    this.faceSelectionCallback = callback;
  }
}

/**
 * Minimal toolbar stand-in for selection mode button updates.
 */
class MockToolbar {
  addSeparator(): void {}
  addDropdown(_label: string, _items: unknown[]): void {}
  addButton(_label: string, _onClick: () => void): void {}
  setButtonActiveByLabel(_label: string, _active: boolean): void {}
}

describe('FaceModeCoordinator', () => {
  let selectionManager: SelectionManager;
  let coordinator: FaceModeCoordinator;
  let mesh: THREE.Mesh;
  let worldObject: THREE.Group;

  beforeEach(() => {
    selectionManager = new SelectionManager();
    worldObject = new THREE.Group();
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    worldObject.add(mesh);
    selectionManager.selectObject(mesh);
    const viewport = new MockViewport();
    coordinator = new FaceModeCoordinator({
      viewport3D: viewport as never,
      viewport2DTop: viewport as never,
      viewport2DFront: viewport as never,
      viewport2DSide: viewport as never,
      commandStack: new CommandStack(16),
      gridSnap: new GridSnap(false, 1),
      worldObject,
      selectionManager,
      toolbar: new MockToolbar() as never,
      statusBar: {
        setSelectionModeInfo: () => undefined
      } as never,
      keyboardShortcutHandler: {
        setOnSelectionModeToggle: () => undefined,
        setOnExtrudeFaces: () => undefined
      } as never,
      showStatusMessage: vi.fn(),
      syncPrimitivesToViewports: () => undefined,
      updateShadingMeshes: () => undefined,
      refreshOutliner: () => undefined
    });
  });

  it('should start in object selection mode', () => {
    expect(coordinator.getSelectionMode()).toBe(SelectionMode.OBJECT);
  });

  it('should clear object selection when entering face mode', () => {
    expect(selectionManager.getSelectedObjects().size).toBe(1);
    coordinator.getFaceExtrusionController().setSelectionMode(SelectionMode.FACE);
    expect(coordinator.getSelectionMode()).toBe(SelectionMode.FACE);
    expect(selectionManager.getSelectedObjects().size).toBe(0);
  });

  it('should not reintroduce object selection requirement in face mode', () => {
    coordinator.getFaceExtrusionController().setSelectionMode(SelectionMode.FACE);
    expect(selectionManager.getSelectedObjects().size).toBe(0);
    expect(coordinator.getFaceExtrusionController().getSelectionMode()).toBe(
      SelectionMode.FACE
    );
  });
});
