import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { ShadableViewport } from '@/viewports/shading/controller_viewport_shading.js';
import { disposeSharedShadingPass } from '@/viewports/shared/shared_shading_pass.js';
import { clearSharedContentMaterialStoreForTests } from '@/viewports/shared/shared_content_material_store.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { resolveOverlapMaterial } from '@/viewports/shading/shading_brush_overlap_materials.js';
import { MESH_WIREFRAME_OVERLAY_USERDATA_KEY } from '@/viewports/shading/mesh_wireframe_overlay.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';

/** Minimal viewport mock for testing the shading controller. */
class MockViewport implements ShadableViewport {
  private scene: THREE.Scene;

  constructor() {
    this.scene = new THREE.Scene();
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  addMesh(mesh: THREE.Mesh): void {
    this.scene.add(mesh);
  }
}

describe('ViewportShadingController', () => {
  let viewport: MockViewport;
  let controller: ControllerViewportShading;
  let meshA: THREE.Mesh;
  let materialA: THREE.MeshStandardMaterial;

  beforeEach(() => {
    disposeSharedShadingPass();
    clearSharedContentMaterialStoreForTests();
    viewport = new MockViewport();
    controller = new ControllerViewportShading(viewport);
    materialA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialA);
    viewport.addMesh(meshA);
  });

  afterEach(() => {
    controller.dispose();
    disposeSharedShadingPass();
    clearSharedContentMaterialStoreForTests();
  });

  describe('default mode', () => {
    it('should default to SOLID mode', () => {
      expect(controller.getShadingMode()).toBe(ShadingMode.SOLID);
    });

    it('should not modify materials in default SOLID mode', () => {
      expect(meshA.material).toBe(materialA);
      expect(materialA.wireframe).toBe(false);
    });
  });

  describe('mode switching', () => {
    it('should switch to WIREFRAME mode', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME);
      expect(controller.getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
    });

    it('should switch to FLAT mode', () => {
      controller.setShadingMode(ShadingMode.FLAT);
      expect(controller.getShadingMode()).toBe(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
    });

    it('should switch to WIREFRAME_OVERLAY mode', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME_OVERLAY);
      expect(controller.getShadingMode()).toBe(ShadingMode.WIREFRAME_OVERLAY);
      expect(meshA.material).toBe(materialA);
      expect(materialA.wireframe).toBe(false);
    });

    it('should switch from WIREFRAME to FLAT', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME);
      controller.setShadingMode(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
    });

    it('should switch from WIREFRAME to SOLID', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME);
      controller.setShadingMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(materialA.wireframe).toBe(false);
    });
  });

  describe('OVERLAP render passes', () => {
    it('swaps brush hulls to overdraw only during the pane pass and restores them afterwards', () => {
      const brush = SolidBrushVisual.createBoxPreview('overlap_brush', 1, SolidOperation.Subtractive);
      const brushMaterial = brush.material;
      viewport.addMesh(brush);
      controller.setShadingMode(ShadingMode.OVERLAP);
      controller.applyForRenderPass();
      expect(brush.material).toBe(resolveOverlapMaterial(SolidOperation.Subtractive));
      controller.endRenderPass();
      expect(brush.material).toBe(brushMaterial);
    });

    it('leaves brush hulls untouched in other modes', () => {
      const brush = SolidBrushVisual.createBoxPreview('solid_brush', 1, SolidOperation.Additive);
      const brushMaterial = brush.material;
      viewport.addMesh(brush);
      controller.setShadingMode(ShadingMode.CLAY);
      controller.applyForRenderPass();
      expect(brush.material).toBe(brushMaterial);
      controller.endRenderPass();
    });
  });

  describe('overlay visibility', () => {
    it('should keep overlay hidden in WIREFRAME mode', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME);
      expect(controller['rendererWireframeOverlay'].isVisible()).toBe(false);
    });

    it('should keep overlay hidden in FLAT mode', () => {
      controller.setShadingMode(ShadingMode.FLAT);
      expect(controller['rendererWireframeOverlay'].isVisible()).toBe(false);
    });

    it('should show overlay in WIREFRAME_OVERLAY mode', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME_OVERLAY);
      expect(controller['rendererWireframeOverlay'].isVisible()).toBe(true);
    });

    it('should hide overlay when switching away from WIREFRAME_OVERLAY', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME_OVERLAY);
      controller.setShadingMode(ShadingMode.SOLID);
      expect(controller['rendererWireframeOverlay'].isVisible()).toBe(false);
    });
  });

  describe('updateMeshes', () => {
    it('should rebuild overlay with new meshes', () => {
      controller.updateMeshes([meshA]);
      expect(controller['rendererWireframeOverlay'].getOverlayCount()).toBe(1);
    });

    it('should rebuild overlay with multiple meshes', () => {
      const meshB = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
      );
      controller.updateMeshes([meshA, meshB]);
      expect(controller['rendererWireframeOverlay'].getOverlayCount()).toBe(2);
    });

    it('should clear overlay when given empty list', () => {
      controller.updateMeshes([meshA]);
      expect(controller['rendererWireframeOverlay'].getOverlayCount()).toBe(1);
      controller.updateMeshes([]);
      expect(controller['rendererWireframeOverlay'].getOverlayCount()).toBe(0);
    });

    it('should not force-apply wireframe materials when only updating mesh lists', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME, false);
      controller.updateMeshes([meshA]);
      expect(meshA.material).toBe(materialA);
      expect(materialA.colorWrite).not.toBe(false);
    });
  });

  describe('deferred shading preference', () => {
    it('should store wireframe preference without mutating shared scene materials', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME, false);
      expect(controller.getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(meshA.material).toBe(materialA);
    });
  });

  describe('no-op on same mode', () => {
    it('should keep outline-only surface materials when setting WIREFRAME twice', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME);
      controller.setShadingMode(ShadingMode.WIREFRAME);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
    });
  });

  describe('display overlay preferences', () => {
    it('defaults content wireframes and projected grid on', () => {
      expect(controller.areContentWireframesVisible()).toBe(true);
      expect(controller.isProjectedGridVisible()).toBe(true);
    });

    it('draws the final mesh wireframe only while enabled, in every shading mode, until the pass ends', () => {
      const world = new THREE.Group();
      const result = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
      result.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
      world.add(result);
      viewport.getScene().add(world);
      const countLines = () =>
        viewport.getScene().children.filter((child) => child.userData[MESH_WIREFRAME_OVERLAY_USERDATA_KEY] === true)
          .length;
      expect(controller.areMeshWireframesVisible()).toBe(false);
      controller.applyDisplayOverlaysForRenderPass(world);
      expect(countLines()).toBe(0);
      controller.setMeshWireframesVisible(true);
      for (const mode of Object.values(ShadingMode)) {
        controller.setShadingMode(mode);
        controller.applyForRenderPass();
        controller.applyDisplayOverlaysForRenderPass(world);
        expect(countLines()).toBe(1);
        controller.endRenderPass();
        expect(countLines()).toBe(0);
      }
    });

    it('stores content wireframe and projected grid toggles', () => {
      controller.setContentWireframesVisible(false);
      controller.setProjectedGridVisible(false);
      expect(controller.areContentWireframesVisible()).toBe(false);
      expect(controller.isProjectedGridVisible()).toBe(false);
    });
  });
});
