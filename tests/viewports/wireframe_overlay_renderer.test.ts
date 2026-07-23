import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { WireframeOverlayRenderer } from '../../src/viewports/wireframe_overlay_renderer.js';
import { Theme } from '../../src/theme.js';

describe('WireframeOverlayRenderer', () => {
  let scene: THREE.Scene;
  let renderer: WireframeOverlayRenderer;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    scene = new THREE.Scene();
    renderer = new WireframeOverlayRenderer(scene);
    meshA = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    meshB = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    );
    scene.add(meshA);
    scene.add(meshB);
  });

  describe('setMeshes', () => {
    it('should create LineSegments parented under a single mesh', () => {
      renderer.setMeshes([meshA]);
      expect(renderer.getOverlayCount()).toBe(1);
      const overlay = renderer.getOverlayForMesh(meshA);
      expect(overlay).toBeDefined();
      expect(overlay?.parent).toBe(meshA);
    });

    it('should create multiple overlays for multiple meshes', () => {
      renderer.setMeshes([meshA, meshB]);
      expect(renderer.getOverlayCount()).toBe(2);
    });

    it('should produce no overlays for empty mesh list', () => {
      renderer.setMeshes([]);
      expect(renderer.getOverlayCount()).toBe(0);
    });

    it('should skip meshes with empty or missing position attributes', () => {
      const emptyGeometry = new THREE.BufferGeometry();
      emptyGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(0), 3)
      );
      const emptyMesh = new THREE.Mesh(
        emptyGeometry,
        new THREE.MeshStandardMaterial()
      );
      const bareMesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial()
      );
      scene.add(emptyMesh);
      scene.add(bareMesh);
      expect(() => renderer.setMeshes([emptyMesh, bareMesh, meshA])).not.toThrow();
      expect(renderer.getOverlayCount()).toBe(1);
      expect(renderer.getOverlayForMesh(meshA)).toBeDefined();
      expect(renderer.getOverlayForMesh(emptyMesh)).toBeUndefined();
    });

    it('should use EdgesGeometry for line creation', () => {
      renderer.setMeshes([meshA]);
      const overlay = renderer.getOverlayForMesh(meshA)!;
      expect(overlay.geometry instanceof THREE.EdgesGeometry).toBe(true);
    });

    it('should use the correct orange line color', () => {
      renderer.setMeshes([meshA]);
      const overlay = renderer.getOverlayForMesh(meshA)!;
      const material = overlay.material as THREE.LineBasicMaterial;
      expect(material.color.getHex()).toBe(Theme.selectionColor);
    });

    it('should keep overlay at local identity so it follows mesh transforms', () => {
      meshA.position.set(3, 4, 5);
      meshA.scale.set(2, 2, 2);
      renderer.setMeshes([meshA]);
      const overlay = renderer.getOverlayForMesh(meshA)!;
      expect(overlay.position.x).toBe(0);
      expect(overlay.position.y).toBe(0);
      expect(overlay.position.z).toBe(0);
      expect(overlay.scale.x).toBe(1);
      meshA.position.set(10, 20, 30);
      renderer.syncTransforms();
      expect(overlay.parent).toBe(meshA);
      expect(overlay.position.x).toBe(0);
    });
  });

  describe('setVisible', () => {
    it('should hide overlays when set to false', () => {
      renderer.setMeshes([meshA]);
      renderer.setVisible(false);
      expect(renderer.isVisible()).toBe(false);
      expect(renderer.getOverlayForMesh(meshA)!.visible).toBe(false);
    });

    it('should show overlays when set to true', () => {
      renderer.setMeshes([meshA]);
      renderer.setVisible(false);
      renderer.setVisible(true);
      expect(renderer.isVisible()).toBe(true);
      expect(renderer.getOverlayForMesh(meshA)!.visible).toBe(true);
    });
  });

  describe('rebuild', () => {
    it('should replace old overlays when calling setMeshes again', () => {
      renderer.setMeshes([meshA]);
      expect(renderer.getOverlayCount()).toBe(1);
      renderer.setMeshes([meshA, meshB]);
      expect(renderer.getOverlayCount()).toBe(2);
    });

    it('should clear overlays when passing empty list after having meshes', () => {
      renderer.setMeshes([meshA]);
      expect(renderer.getOverlayCount()).toBe(1);
      renderer.setMeshes([]);
      expect(renderer.getOverlayCount()).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should remove overlays from meshes', () => {
      renderer.setMeshes([meshA]);
      renderer.dispose();
      expect(renderer.getOverlayCount()).toBe(0);
      expect(meshA.children.some((c) => c.userData.isWireframeOverlay)).toBe(false);
    });
  });
});
