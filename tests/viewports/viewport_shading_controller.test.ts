import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ViewportShadingController } from '../../src/viewports/viewport_shading_controller.js';
import { ShadingMode } from '../../src/types/shading_mode.js';
import { ShadableViewport } from '../../src/viewports/viewport_shading_controller.js';

/**
 * Minimal viewport mock for testing the shading controller.
 */
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
  let controller: ViewportShadingController;
  let meshA: THREE.Mesh;
  let materialA: THREE.MeshStandardMaterial;

  beforeEach(() => {
    viewport = new MockViewport();
    controller = new ViewportShadingController(viewport);
    materialA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialA);
    viewport.addMesh(meshA);
  });

  describe('default mode', () => {
    it('should default to SOLID mode', () => {
      expect(controller.getShadingMode()).toBe(ShadingMode.SOLID);
    });

    it('should not modify materials in default SOLID mode', () => {
      expect(meshA.material).toBe(materialA);
      expect(meshA.material.wireframe).toBe(false);
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
      expect(meshA.material.wireframe).toBe(false);
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
      expect(meshA.material.wireframe).toBe(false);
    });
  });

  describe('overlay visibility', () => {
    it('should keep overlay hidden in WIREFRAME mode', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME);
      expect(controller['wireframeOverlayRenderer'].isVisible()).toBe(false);
    });

    it('should keep overlay hidden in FLAT mode', () => {
      controller.setShadingMode(ShadingMode.FLAT);
      expect(controller['wireframeOverlayRenderer'].isVisible()).toBe(false);
    });

    it('should show overlay in WIREFRAME_OVERLAY mode', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME_OVERLAY);
      expect(controller['wireframeOverlayRenderer'].isVisible()).toBe(true);
    });

    it('should hide overlay when switching away from WIREFRAME_OVERLAY', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME_OVERLAY);
      controller.setShadingMode(ShadingMode.SOLID);
      expect(controller['wireframeOverlayRenderer'].isVisible()).toBe(false);
    });
  });

  describe('updateMeshes', () => {
    it('should rebuild overlay with new meshes', () => {
      controller.updateMeshes([meshA]);
      expect(controller['wireframeOverlayRenderer'].getOverlayCount()).toBe(1);
    });

    it('should rebuild overlay with multiple meshes', () => {
      const meshB = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 })
      );
      controller.updateMeshes([meshA, meshB]);
      expect(controller['wireframeOverlayRenderer'].getOverlayCount()).toBe(2);
    });

    it('should clear overlay when given empty list', () => {
      controller.updateMeshes([meshA]);
      expect(controller['wireframeOverlayRenderer'].getOverlayCount()).toBe(1);
      controller.updateMeshes([]);
      expect(controller['wireframeOverlayRenderer'].getOverlayCount()).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should clean up without error', () => {
      controller.setShadingMode(ShadingMode.WIREFRAME);
      controller.updateMeshes([meshA]);
      expect(() => controller.dispose()).not.toThrow();
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
});
