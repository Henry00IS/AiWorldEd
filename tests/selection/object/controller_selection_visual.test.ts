import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

/** Minimal viewport stand-in with a scene for selection outline tests. */
class MockViewport {
  private scene: THREE.Scene;
  private selectionManager: ManagerSelection | null;

  constructor() {
    this.scene = new THREE.Scene();
    this.selectionManager = null;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  setSelectionManager(manager: ManagerSelection): void {
    this.selectionManager = manager;
  }

  setSelectionHighlight(_highlight: unknown): void {}

  getSelectionManager(): ManagerSelection | null {
    return this.selectionManager;
  }
}

/**
 * Builds a viewport sync stub that reports world meshes for hull fill sync.
 *
 * @param worldMeshes Authoritative selectable meshes.
 * @returns Partial ViewportSyncManager used by the controller.
 */
function createSyncManagerStub(worldMeshes: THREE.Mesh[]): ManagerViewportSync {
  return {
    getWorldSelectableMeshes: () => worldMeshes.slice(),
    getWorldObject: () => null,
  } as unknown as ManagerViewportSync;
}

describe('SelectionVisualController', () => {
  let selectionManager: ManagerSelection;
  let world: THREE.Group;
  let mesh: THREE.Mesh;
  let viewport3d: MockViewport;
  let viewport2d: MockViewport;
  let syncManager: ManagerViewportSync;
  let controller: ControllerSelectionVisual;

  beforeEach(() => {
    selectionManager = new ManagerSelection();
    world = new THREE.Group();
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'Box';
    world.add(mesh);
    viewport3d = new MockViewport();
    viewport2d = new MockViewport();
    viewport3d.getScene().add(world);
    syncManager = createSyncManagerStub([mesh]);
    controller = new ControllerSelectionVisual(selectionManager, syncManager);
    controller.wireViewports([viewport3d as any, viewport2d as any]);
  });

  it('should apply selection outline to the world mesh on selection', () => {
    selectionManager.selectObject(mesh);
    const hasOutline = mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true);
    expect(hasOutline).toBe(true);
  });

  it('should keep outline as a child after transform sync', () => {
    selectionManager.selectObject(mesh);
    mesh.position.set(3, 4, 5);
    controller.syncDuringTransform();
    const outline = mesh.children.find(
      (child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true,
    ) as THREE.Object3D;
    expect(outline.parent).toBe(mesh);
    expect(outline.position.x).toBe(0);
  });

  it('should reapply outlines after viewport selectable refresh', () => {
    selectionManager.selectObject(mesh);
    controller.reapplyAfterViewportSync();
    const hasOutline = mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true);
    expect(hasOutline).toBe(true);
  });

  it('should clear outlines when selection is cleared', () => {
    selectionManager.selectObject(mesh);
    selectionManager.clearSelection();
    const hasOutline = mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true);
    expect(hasOutline).toBe(false);
  });

  it('should clear object selection outlines when chrome is disabled for Edit Mode', () => {
    selectionManager.selectObject(mesh);
    expect(mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true)).toBe(true);
    controller.setObjectSelectionChromeEnabled(false);
    expect(mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true)).toBe(false);
    controller.setObjectSelectionChromeEnabled(true);
    expect(mesh.children.some((child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true)).toBe(true);
  });

  it('should show solid brush hull fill only while the brush is selected', () => {
    const brushMesh = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Subtractive);
    world.add(brushMesh);
    syncManager = createSyncManagerStub([mesh, brushMesh]);
    controller = new ControllerSelectionVisual(selectionManager, syncManager);
    controller.wireViewports([viewport3d as any, viewport2d as any]);
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(false);
    selectionManager.selectObject(brushMesh);
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(true);
    const fillMaterial = brushMesh.material as THREE.MeshBasicMaterial;
    expect(fillMaterial.colorWrite).toBe(true);
    expect(fillMaterial.color.getHex()).toBe(0xc0392b);
    selectionManager.clearSelection();
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(false);
    expect((brushMesh.material as THREE.MeshBasicMaterial).colorWrite).toBe(false);
  });

  it('should clear hull fill userData when a selected brush is detached like undo', () => {
    const brushMesh = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
    world.add(brushMesh);
    syncManager = createSyncManagerStub([mesh, brushMesh]);
    controller = new ControllerSelectionVisual(selectionManager, syncManager);
    controller.wireViewports([viewport3d as any, viewport2d as any]);
    selectionManager.selectObject(brushMesh);
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(true);

    world.remove(brushMesh);
    selectionManager.pruneSelectionNotInScene(world);
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(false);

    world.add(brushMesh);
    controller.reapplyAfterViewportSync();
    expect(SolidBrushVisual.isHullFillVisible(brushMesh)).toBe(false);
    expect((brushMesh.material as THREE.MeshBasicMaterial).colorWrite).toBe(false);
  });

  it.each([{}, { role: 'generator' as const }])(
    'should show a modifier volume or generator box fill only while selected (%o)',
    (settings) => {
      const node = ModifierVolume.create(settings);
      world.add(node);
      const outline = node.children.find((child) => child instanceof THREE.LineSegments);
      expect(ModifierVolume.isFillVisible(node)).toBe(false);
      selectionManager.selectObject(node);
      expect(ModifierVolume.isFillVisible(node)).toBe(true);
      expect((node.material as THREE.MeshBasicMaterial).transparent).toBe(true);
      selectionManager.clearSelection();
      expect(ModifierVolume.isFillVisible(node)).toBe(false);
      expect(outline?.visible).toBe(true);
    },
  );

  it('should hide volume fills while object selection chrome is disabled for Edit Mode', () => {
    const node = ModifierVolume.create({});
    world.add(node);
    selectionManager.selectObject(node);
    controller.setObjectSelectionChromeEnabled(false);
    expect(ModifierVolume.isFillVisible(node)).toBe(false);
    controller.setObjectSelectionChromeEnabled(true);
    expect(ModifierVolume.isFillVisible(node)).toBe(true);
  });

  it('should not show the fill on a duplicate of a selected volume', () => {
    const node = ModifierVolume.create({});
    world.add(node);
    selectionManager.selectObject(node);
    const duplicate = new THREE.Mesh(node.geometry.clone(), (node.material as THREE.Material).clone());
    ModifierVolume.copyOntoClone(node, duplicate);
    expect(ModifierVolume.isFillVisible(duplicate)).toBe(false);
  });
});
