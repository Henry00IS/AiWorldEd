import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/** Minimal viewport stand-in for face mode coordinator wiring. */
class MockViewport {
  private camera: THREE.PerspectiveCamera;
  private renderer: { domElement: HTMLCanvasElement };
  private scene: THREE.Scene;
  private contentElement: HTMLDivElement;

  constructor() {
    this.camera = new THREE.PerspectiveCamera();
    this.renderer = { domElement: document.createElement('canvas') };
    this.scene = new THREE.Scene();
    this.contentElement = document.createElement('div');
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

  getContentElement(): HTMLElement {
    return this.contentElement;
  }
}

/** Face mode must not pick solid brush volume helpers (esp. subtractive hulls). */
describe('Face mode excludes solid brush helpers', () => {
  let worldObject: THREE.Group;
  let coordinator: CoordinatorFaceMode;

  beforeEach(() => {
    worldObject = new THREE.Group();
    const viewport = new MockViewport();
    coordinator = new CoordinatorFaceMode({
      getViewports: () => [viewport as never],
      getPrimaryScene: () => viewport.getScene(),
      commandStack: new CommandStack(16),
      gridSnap: new GridSnap(false, 1),
      worldObject,
      selectionManager: new ManagerSelection(),
      statusBar: {
        setSelectionModeInfo: () => undefined,
      } as never,
      keyboardShortcutHandler: {
        setOnSelectionModeToggle: () => undefined,
        setOnExtrudeFaces: () => undefined,
        isKeyDown: () => false,
      } as never,
      showStatusMessage: vi.fn(),
      syncPrimitivesToViewports: () => undefined,
      updateShadingMeshes: () => undefined,
      refreshOutliner: () => undefined,
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

  it('excludes free content meshes from face pick list', () => {
    const freeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    worldObject.add(freeMesh);
    const model = new SolidModel('FacePickSolidFree');
    worldObject.add(model.root);
    model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    coordinator.updateFaceSelectionMeshes();
    const pickable = coordinator.getFacePickableMeshesForTesting();
    expect(pickable).not.toContain(freeMesh);
    expect(pickable).toContain(model.getResultMesh());
  });
});
