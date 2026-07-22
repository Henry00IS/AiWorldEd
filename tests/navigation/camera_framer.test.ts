import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CameraFramer } from '../../src/navigation/camera_framer.js';
import { BoundingVolumeComputer } from '../../src/navigation/bounding_volume_computer.js';

describe('CameraFramer', () => {
  let framer: CameraFramer;
  let boundingVolumeComputer: BoundingVolumeComputer;
  let perspectiveCamera: THREE.PerspectiveCamera;
  let orthographicCamera: THREE.OrthographicCamera;

  beforeEach(() => {
    framer = new CameraFramer();
    boundingVolumeComputer = new BoundingVolumeComputer();
    perspectiveCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    perspectiveCamera.position.set(5, 5, 5);
    perspectiveCamera.lookAt(0, 0, 0);
    orthographicCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    orthographicCamera.position.set(0, 0, 50);
    orthographicCamera.lookAt(0, 0, 0);
  });

  describe('computePerspectiveTarget', () => {
    it('should return a target look-at at the sphere center', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      const target = framer.computePerspectiveTarget(sphere, perspectiveCamera, 1.5);
      expect(target.targetLookAt.x).toBeCloseTo(0, 3);
      expect(target.targetLookAt.y).toBeCloseTo(0, 3);
      expect(target.targetLookAt.z).toBeCloseTo(0, 3);
    });

    it('should position camera along view direction', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      const target = framer.computePerspectiveTarget(sphere, perspectiveCamera, 1.5);
      const distance = target.targetPosition.distanceTo(target.targetLookAt);
      expect(distance).toBeGreaterThan(0);
    });

    it('should increase distance with larger padding factor', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      const targetSmall = framer.computePerspectiveTarget(sphere, perspectiveCamera, 1.0);
      const targetLarge = framer.computePerspectiveTarget(sphere, perspectiveCamera, 3.0);
      const distSmall = targetSmall.targetPosition.distanceTo(targetSmall.targetLookAt);
      const distLarge = targetLarge.targetPosition.distanceTo(targetLarge.targetLookAt);
      expect(distLarge).toBeGreaterThan(distSmall);
    });

    it('should increase distance with larger bounding sphere', () => {
      const mesh = createBoxMesh(4, 4, 4, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      const target = framer.computePerspectiveTarget(sphere, perspectiveCamera, 1.5);
      const distance = target.targetPosition.distanceTo(target.targetLookAt);
      expect(distance).toBeGreaterThan(1);
    });

    it('should handle offset sphere centers', () => {
      const mesh = createBoxMesh(1, 1, 1, 10, 10, 10);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      const target = framer.computePerspectiveTarget(sphere, perspectiveCamera, 1.5);
      expect(target.targetLookAt.x).toBeCloseTo(10, 3);
      expect(target.targetLookAt.y).toBeCloseTo(10, 3);
      expect(target.targetLookAt.z).toBeCloseTo(10, 3);
    });

    it('should account for FOV in distance calculation', () => {
      const narrowCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
      narrowCamera.position.set(5, 5, 5);
      narrowCamera.lookAt(0, 0, 0);
      const wideCamera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
      wideCamera.position.set(5, 5, 5);
      wideCamera.lookAt(0, 0, 0);
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      const narrowTarget = framer.computePerspectiveTarget(sphere, narrowCamera, 1.5);
      const wideTarget = framer.computePerspectiveTarget(sphere, wideCamera, 1.5);
      const narrowDist = narrowTarget.targetPosition.distanceTo(narrowTarget.targetLookAt);
      const wideDist = wideTarget.targetPosition.distanceTo(wideTarget.targetLookAt);
      expect(narrowDist).toBeGreaterThan(wideDist);
    });
  });

  describe('computeOrthographicTarget', () => {
    it('should return frustum planes enclosing the bounding box', () => {
      const mesh = createBoxMesh(2, 2, 2, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      expect(target.left).toBeCloseTo(-1);
      expect(target.right).toBeCloseTo(1);
      expect(target.top).toBeCloseTo(1);
      expect(target.bottom).toBeCloseTo(-1);
    });

    it('should expand frustum with padding factor', () => {
      const mesh = createBoxMesh(2, 2, 2, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.5);
      expect(target.left).toBeCloseTo(-1.5);
      expect(target.right).toBeCloseTo(1.5);
    });

    it('should handle offset bounding boxes in view space', () => {
      const mesh = createBoxMesh(2, 2, 2, 5, 5, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      expect(target.left).toBeCloseTo(4);
      expect(target.right).toBeCloseTo(6);
      expect(target.top).toBeCloseTo(6);
      expect(target.bottom).toBeCloseTo(4);
    });

    it('should expand asymmetric content to preserve frustum aspect', () => {
      const mesh = createBoxMesh(4, 2, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      const width = target.right - target.left;
      const height = target.top - target.bottom;
      const aspect =
        (orthographicCamera.right - orthographicCamera.left) /
        (orthographicCamera.top - orthographicCamera.bottom);
      expect(width / height).toBeCloseTo(aspect);
      expect(width).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(height).toBeGreaterThanOrEqual(2 - 1e-6);
    });

    it('should handle single mesh', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.5);
      expect(target.right - target.left).toBeGreaterThan(0);
      expect(target.top - target.bottom).toBeGreaterThan(0);
    });

    it('should center frustum on bounding box center', () => {
      const meshA = createBoxMesh(1, 1, 1, -3, 0, 0);
      const meshB = createBoxMesh(1, 1, 1, 3, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([meshA, meshB]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      const centerX = (target.left + target.right) / 2;
      expect(centerX).toBeCloseTo(0);
    });

    it('should frame correctly for a top-down orthographic camera', () => {
      const topCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
      topCamera.position.set(0, 50, 0);
      topCamera.up.set(0, 0, -1);
      topCamera.lookAt(0, 0, 0);
      topCamera.updateMatrixWorld(true);
      const mesh = createBoxMesh(2, 2, 4, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, topCamera, 1.0);
      expect(target.right - target.left).toBeGreaterThan(0);
      expect(target.top - target.bottom).toBeGreaterThan(0);
      const centerX = (target.left + target.right) / 2;
      const centerY = (target.top + target.bottom) / 2;
      expect(Math.abs(centerX)).toBeLessThan(0.01);
      expect(Math.abs(centerY)).toBeLessThan(0.01);
    });
  });

  describe('computePerspectiveTarget direction', () => {
    it('should keep the camera on the same side of the look-at target', () => {
      perspectiveCamera.position.set(5, 5, 5);
      perspectiveCamera.lookAt(0, 0, 0);
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      const target = framer.computePerspectiveTarget(sphere, perspectiveCamera, 1.5);
      const startDir = perspectiveCamera.position.clone().sub(new THREE.Vector3(0, 0, 0)).normalize();
      const endDir = target.targetPosition.clone().sub(target.targetLookAt).normalize();
      expect(endDir.dot(startDir)).toBeGreaterThan(0.99);
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
