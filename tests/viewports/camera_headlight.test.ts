import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CameraHeadlight } from '../../src/viewports/camera_headlight.js';

describe('CameraHeadlight', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let headlight: CameraHeadlight;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    headlight = new CameraHeadlight(0xffffff, 0.8);
    headlight.attachToCamera(scene, camera);
  });

  it('should parent the light under the camera', () => {
    expect(headlight.getLight().parent).toBe(camera);
  });

  it('should parent the light target under the camera', () => {
    expect(headlight.getLight().target.parent).toBe(camera);
  });

  it('should add the camera to the scene graph', () => {
    expect(camera.parent).toBe(scene);
  });

  it('should shine along the camera forward direction', () => {
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    const shine = headlight.getWorldShineDirection();
    expect(shine.dot(cameraForward)).toBeGreaterThan(0.99);
  });

  it('should follow the camera when the camera rotates', () => {
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const forwardA = new THREE.Vector3();
    camera.getWorldDirection(forwardA);
    expect(headlight.getWorldShineDirection().dot(forwardA)).toBeGreaterThan(0.99);

    camera.position.set(10, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const forwardB = new THREE.Vector3();
    camera.getWorldDirection(forwardB);
    expect(headlight.getWorldShineDirection().dot(forwardB)).toBeGreaterThan(0.99);
    expect(forwardA.dot(forwardB)).toBeLessThan(0.5);
  });

  it('should expose the directional light instance', () => {
    expect(headlight.getLight()).toBeInstanceOf(THREE.DirectionalLight);
  });
});
