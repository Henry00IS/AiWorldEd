import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SelectionVisualController } from '../../src/managers/selection_visual_controller.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { ViewportSyncManager } from '../../src/managers/viewport_sync_manager.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../../src/selection/selection_highlight.js';

/**
 * Minimal viewport stand-in with a scene for selection outline tests.
 */
class MockViewport {
  private scene: THREE.Scene;
  private selectionManager: SelectionManager | null;

  constructor() {
    this.scene = new THREE.Scene();
    this.selectionManager = null;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  setSelectionManager(manager: SelectionManager): void {
    this.selectionManager = manager;
  }

  setSelectionHighlight(_highlight: unknown): void {}

  getSelectionManager(): SelectionManager | null {
    return this.selectionManager;
  }
}

describe('SelectionVisualController', () => {
  let selectionManager: SelectionManager;
  let world: THREE.Group;
  let mesh: THREE.Mesh;
  let viewport3d: MockViewport;
  let viewport2d: MockViewport;
  let syncManager: ViewportSyncManager;
  let controller: SelectionVisualController;

  beforeEach(() => {
    selectionManager = new SelectionManager();
    world = new THREE.Group();
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    mesh.name = 'Box';
    world.add(mesh);
    viewport3d = new MockViewport();
    viewport2d = new MockViewport();
    viewport3d.getScene().add(world);
    syncManager = {
      findCloneMeshesForWorldUuid: () => []
    } as unknown as ViewportSyncManager;
    controller = new SelectionVisualController(selectionManager, syncManager);
    controller.wireViewports([viewport3d as any, viewport2d as any]);
  });

  it('should apply selection outline to the world mesh on selection', () => {
    selectionManager.selectObject(mesh);
    const hasOutline = mesh.children.some(
      (child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true
    );
    expect(hasOutline).toBe(true);
  });

  it('should keep outline as a child after transform sync', () => {
    selectionManager.selectObject(mesh);
    mesh.position.set(3, 4, 5);
    controller.syncDuringTransform();
    const outline = mesh.children.find(
      (child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true
    ) as THREE.Object3D;
    expect(outline.parent).toBe(mesh);
    expect(outline.position.x).toBe(0);
  });

  it('should reapply outlines after viewport clone rebuild', () => {
    selectionManager.selectObject(mesh);
    controller.reapplyAfterViewportSync();
    const hasOutline = mesh.children.some(
      (child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true
    );
    expect(hasOutline).toBe(true);
  });

  it('should clear outlines when selection is cleared', () => {
    selectionManager.selectObject(mesh);
    selectionManager.clearSelection();
    const hasOutline = mesh.children.some(
      (child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true
    );
    expect(hasOutline).toBe(false);
  });
});
