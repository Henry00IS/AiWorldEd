import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { BoundingVolumeComputer } from '../../src/navigation/bounding_volume_computer.js';

describe('BoundingVolumeComputer', () => {
  let computer: BoundingVolumeComputer;

  beforeEach(() => {
    computer = new BoundingVolumeComputer();
  });

  describe('computeWorldBoundingBox', () => {
    it('should return an empty box for empty mesh array', () => {
      const box = computer.computeWorldBoundingBox([]);
      expect(box.isEmpty()).toBe(true);
    });

    it('should compute bounding box for a single mesh at origin', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = computer.computeWorldBoundingBox([mesh]);
      expect(box.isEmpty()).toBe(false);
      expect(box.min.x).toBeCloseTo(-0.5);
      expect(box.max.x).toBeCloseTo(0.5);
    });

    it('should account for mesh position offset', () => {
      const mesh = createBoxMesh(1, 1, 1, 2, 3, 4);
      const box = computer.computeWorldBoundingBox([mesh]);
      expect(box.min.x).toBeCloseTo(1.5);
      expect(box.min.y).toBeCloseTo(2.5);
      expect(box.min.z).toBeCloseTo(3.5);
    });

    it('should merge bounding boxes of multiple meshes', () => {
      const meshA = createBoxMesh(1, 1, 1, 0, 0, 0);
      const meshB = createBoxMesh(1, 1, 1, 3, 0, 0);
      const box = computer.computeWorldBoundingBox([meshA, meshB]);
      expect(box.min.x).toBeCloseTo(-0.5);
      expect(box.max.x).toBeCloseTo(3.5);
    });

    it('should account for mesh scale', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      mesh.scale.set(2, 2, 2);
      const box = computer.computeWorldBoundingBox([mesh]);
      expect(box.min.x).toBeCloseTo(-1);
      expect(box.max.x).toBeCloseTo(1);
    });

    it('should handle meshes on different axes', () => {
      const meshX = createBoxMesh(1, 1, 1, 5, 0, 0);
      const meshY = createBoxMesh(1, 1, 1, 0, 5, 0);
      const meshZ = createBoxMesh(1, 1, 1, 0, 0, 5);
      const box = computer.computeWorldBoundingBox([meshX, meshY, meshZ]);
      expect(box.min.x).toBeCloseTo(-0.5);
      expect(box.min.y).toBeCloseTo(-0.5);
      expect(box.min.z).toBeCloseTo(-0.5);
      expect(box.max.x).toBeCloseTo(5.5);
      expect(box.max.y).toBeCloseTo(5.5);
      expect(box.max.z).toBeCloseTo(5.5);
    });
  });

  describe('computeBoundingSphere', () => {
    it('should create a sphere centered on the box center', () => {
      const mesh = createBoxMesh(2, 2, 2, 5, 5, 5);
      const box = computer.computeWorldBoundingBox([mesh]);
      const sphere = computer.computeBoundingSphere(box);
      expect(sphere.center.x).toBeCloseTo(5);
      expect(sphere.center.y).toBeCloseTo(5);
      expect(sphere.center.z).toBeCloseTo(5);
    });

    it('should have a radius large enough to contain the box', () => {
      const mesh = createBoxMesh(2, 2, 2, 0, 0, 0);
      const box = computer.computeWorldBoundingBox([mesh]);
      const sphere = computer.computeBoundingSphere(box);
      const corner = new THREE.Vector3(1, 1, 1);
      const distance = sphere.center.distanceTo(corner);
      expect(sphere.radius).toBeGreaterThanOrEqual(distance);
    });

    it('should compute sphere for a single point box', () => {
      const mesh = createBoxMesh(0.001, 0.001, 0.001, 0, 0, 0);
      const box = computer.computeWorldBoundingBox([mesh]);
      const sphere = computer.computeBoundingSphere(box);
      expect(sphere.radius).toBeGreaterThan(0);
    });

    it('should handle asymmetric bounding boxes', () => {
      const mesh = createBoxMesh(1, 3, 5, 0, 0, 0);
      const box = computer.computeWorldBoundingBox([mesh]);
      const sphere = computer.computeBoundingSphere(box);
      expect(sphere.radius).toBeGreaterThan(0);
    });
  });

  describe('getBoundingBoxCenter', () => {
    it('should return the center of a box at origin', () => {
      const mesh = createBoxMesh(2, 2, 2, 0, 0, 0);
      const box = computer.computeWorldBoundingBox([mesh]);
      const center = computer.getBoundingBoxCenter(box);
      expect(center.x).toBeCloseTo(0);
      expect(center.y).toBeCloseTo(0);
      expect(center.z).toBeCloseTo(0);
    });

    it('should return the center of an offset box', () => {
      const mesh = createBoxMesh(2, 2, 2, 10, 20, 30);
      const box = computer.computeWorldBoundingBox([mesh]);
      const center = computer.getBoundingBoxCenter(box);
      expect(center.x).toBeCloseTo(10);
      expect(center.y).toBeCloseTo(20);
      expect(center.z).toBeCloseTo(30);
    });

    it('should return the midpoint between two separated boxes', () => {
      const meshA = createBoxMesh(1, 1, 1, 0, 0, 0);
      const meshB = createBoxMesh(1, 1, 1, 10, 0, 0);
      const box = computer.computeWorldBoundingBox([meshA, meshB]);
      const center = computer.getBoundingBoxCenter(box);
      expect(center.x).toBeCloseTo(5);
    });
  });
});

function createBoxMesh(
  width: number, height: number, depth: number,
  px: number, py: number, pz: number
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  return mesh;
}
