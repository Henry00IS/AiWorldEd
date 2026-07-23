import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { FaceModeCoordinator } from '../../src/managers/face_mode_coordinator.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { GridSnap } from '../../src/transform/grid_snap.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';

/**
 * Minimal viewport stand-in for face mode coordinator wiring.
 */
class MockViewport {
  private camera: THREE.PerspectiveCamera;
  private renderer: { domElement: HTMLCanvasElement };
  private scene: THREE.Scene;

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

  setFaceSelectionCallback(_callback: (event: MouseEvent) => boolean): void {
    void _callback;
  }
}

/**
 * Face mode must not pick solid brush volume helpers (esp. subtractive hulls).
 */
describe('Face mode excludes solid brush helpers', () => {
  let worldObject: THREE.Group;
  let coordinator: FaceModeCoordinator;

  beforeEach(() => {
    worldObject = new THREE.Group();
    const viewport = new MockViewport();
    coordinator = new FaceModeCoordinator({
      viewport3D: viewport as never,
      viewport2DTop: viewport as never,
      viewport2DFront: viewport as never,
      viewport2DSide: viewport as never,
      commandStack: new CommandStack(16),
      gridSnap: new GridSnap(false, 1),
      worldObject,
      selectionManager: new SelectionManager(),
      statusBar: {
        setSelectionModeInfo: () => undefined
      } as never,
      keyboardShortcutHandler: {
        setOnSelectionModeToggle: () => undefined,
        setOnExtrudeFaces: () => undefined,
        isKeyDown: () => false
      } as never,
      showStatusMessage: vi.fn(),
      syncPrimitivesToViewports: () => undefined,
      updateShadingMeshes: () => undefined,
      refreshOutliner: () => undefined
    });
  });

  it('excludes additive and subtractive brush helpers from face pick list', () => {
    const model = new SolidModel('FacePickSolid');
    worldObject.add(model.root);
    const additive = model.addBoxBrush(4, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    coordinator.updateFaceSelectionMeshes();
    const pickable = coordinator.getFacePickableMeshesForTesting();
    expect(SolidBrushVisual.isBrushObject(additive.mesh!)).toBe(true);
    expect(SolidBrushVisual.isBrushObject(subtractive.mesh!)).toBe(true);
    expect(pickable).not.toContain(additive.mesh);
    expect(pickable).not.toContain(subtractive.mesh);
    expect(pickable).toContain(model.getResultMesh());
  });
});
