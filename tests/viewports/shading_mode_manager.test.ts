import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ShadingModeManager } from '../../src/viewports/shading_mode_manager.js';
import { ShadingMode } from '../../src/types/shading_mode.js';

describe('ShadingModeManager', () => {
  let scene: THREE.Scene;
  let manager: ShadingModeManager;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;
  let materialA: THREE.MeshStandardMaterial;
  let materialB: THREE.MeshStandardMaterial;

  beforeEach(() => {
    scene = new THREE.Scene();
    manager = new ShadingModeManager(scene);
    materialA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    materialB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialA);
    meshB = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), materialB);
  });

  describe('snapshotMaterials', () => {
    it('should capture materials after meshes are added', () => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
      expect(materialA.wireframe).toBe(false);
      expect(materialB.wireframe).toBe(false);
    });

    it('should handle empty scene without error', () => {
      manager.snapshotMaterials();
      expect(() => manager.snapshotMaterials()).not.toThrow();
    });

    it('should handle multiple meshes correctly', () => {
      const meshC = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: 0x0000ff })
      );
      scene.add(meshA);
      scene.add(meshB);
      scene.add(meshC);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      expect((meshB.material as THREE.Material).colorWrite).toBe(false);
      expect((meshC.material as THREE.Material).colorWrite).toBe(false);
    });
  });

  describe('WIREFRAME mode', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should replace materials with outline-only surface materials', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect(meshB.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      expect((meshB.material as THREE.Material).colorWrite).toBe(false);
    });

    it('should not use triangle wireframe on content materials', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect(meshA.material.wireframe).toBe(false);
      expect(meshB.material.wireframe).toBe(false);
    });

    it('should keep writing depth so outlines occlude correctly', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).depthWrite).toBe(true);
      expect((meshB.material as THREE.Material).depthWrite).toBe(true);
    });

    it('should leave decorative edge children visible', () => {
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(meshA.geometry),
        new THREE.LineBasicMaterial({ color: 0xffffff })
      );
      edge.userData.isDecorativeEdge = true;
      meshA.add(edge);
      manager.setMode(ShadingMode.WIREFRAME);
      expect(edge.visible).toBe(true);
      expect(edge.parent).toBe(meshA);
    });

    it('should handle empty scene in WIREFRAME mode', () => {
      manager.snapshotMaterials();
      expect(() => manager.setMode(ShadingMode.WIREFRAME)).not.toThrow();
    });
  });

  describe('FLAT mode', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should replace materials with unlit MeshBasicMaterial', () => {
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect(meshB.material instanceof THREE.MeshBasicMaterial).toBe(true);
    });

    it('should keep content albedo colors at full brightness (unlit)', () => {
      manager.setMode(ShadingMode.FLAT);
      const colorA = (meshA.material as THREE.MeshBasicMaterial).color;
      const colorB = (meshB.material as THREE.MeshBasicMaterial).color;
      expect(colorA.getHex()).toBe(0xff0000);
      expect(colorB.getHex()).toBe(0x00ff00);
    });

    it('should use independent flat material instances per mesh', () => {
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material).not.toBe(meshB.material);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect(meshB.material instanceof THREE.MeshBasicMaterial).toBe(true);
    });

    it('should not let disposing one flat mesh material affect the other', () => {
      manager.setMode(ShadingMode.FLAT);
      const materialB = meshB.material as THREE.MeshBasicMaterial;
      (meshA.material as THREE.Material).dispose();
      expect(materialB.color.getHex()).toBe(0x00ff00);
    });
  });

  describe('SOLID mode', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should restore original materials after WIREFRAME', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshB.material).toBe(materialB);
      expect(meshA.material.wireframe).toBe(false);
      expect(meshB.material.wireframe).toBe(false);
    });

    it('should restore original materials after FLAT', () => {
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshB.material).toBe(materialB);
    });

    it('should restore original color after FLAT mode', () => {
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material.color.getHex()).toBe(0xff0000);
      expect(meshB.material.color.getHex()).toBe(0x00ff00);
    });

    it('should be a no-op when already in SOLID mode', () => {
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshA.material.wireframe).toBe(false);
    });
  });

  describe('roundtrip', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should survive SOLID to WIREFRAME to SOLID roundtrip', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshA.material.wireframe).toBe(false);
      expect((meshA.material as THREE.Material).colorWrite).toBe(true);
    });

    it('should survive SOLID to FLAT to SOLID roundtrip', () => {
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshA.material.color.getHex()).toBe(0xff0000);
    });

    it('should survive SOLID to WIREFRAME to FLAT to SOLID roundtrip', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshB.material).toBe(materialB);
      expect(meshA.material.wireframe).toBe(false);
    });

    it('should survive FLAT to WIREFRAME to FLAT roundtrip', () => {
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect((meshA.material as THREE.MeshBasicMaterial).color.getHex()).toBe(
        0xff0000
      );
    });
  });

  describe('dispose', () => {
    it('should clean up resources without error', () => {
      scene.add(meshA);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.WIREFRAME);
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('editor helper exclusion', () => {
    it('should not apply outline-only materials to bounds resize handles', () => {
      const gizmoRoot = new THREE.Group();
      gizmoRoot.name = 'transform_gizmo_viewport';
      const handleMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), handleMaterial);
      handleMesh.name = 'bounds_handle_pos_x';
      handleMesh.userData.handleId = 1;
      gizmoRoot.add(handleMesh);
      scene.add(meshA);
      scene.add(gizmoRoot);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      expect(handleMesh.material).toBe(handleMaterial);
      expect(handleMaterial.colorWrite).toBe(true);
      manager.setMode(ShadingMode.SOLID);
      expect(handleMesh.material).toBe(handleMaterial);
    });

    it('should not replace bounds handle materials in FLAT mode', () => {
      const gizmoRoot = new THREE.Group();
      gizmoRoot.name = 'bounds_gizmo';
      const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), handleMaterial);
      handleMesh.userData.handleId = 2;
      gizmoRoot.add(handleMesh);
      scene.add(meshA);
      scene.add(gizmoRoot);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material).not.toBe(materialA);
      expect(handleMesh.material).toBe(handleMaterial);
    });

    it('should leave shared gizmo materials solid after content wireframe roundtrip', () => {
      const masterMaterial = new THREE.MeshBasicMaterial({ color: 0x3366ff });
      const masterHandle = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), masterMaterial);
      masterHandle.userData.handleId = 3;
      const viewportClone = masterHandle.clone(true);
      const gizmoRoot = new THREE.Group();
      gizmoRoot.name = 'transform_gizmo_viewport';
      gizmoRoot.add(viewportClone);
      scene.add(meshA);
      scene.add(gizmoRoot);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.SOLID);
      expect(masterMaterial.wireframe).toBe(false);
      expect((viewportClone.material as THREE.Material).wireframe).toBe(false);
    });

    it('should report bounds handles as shading-exempt', () => {
      const handleMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      );
      handleMesh.userData.handleId = 9;
      expect(manager.isShadingExempt(handleMesh)).toBe(true);
      expect(manager.isShadingExempt(meshA)).toBe(false);
    });
  });
});
