import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CameraFitController } from '../../src/navigation/camera_fit_controller.js';
import { CameraAnimationConfig } from '../../src/navigation/camera_animation_config.js';

describe('CameraFitController', () => {
  let controller: CameraFitController;
  let config: CameraAnimationConfig;

  beforeEach(() => {
    controller = new CameraFitController();
    config = controller.getConfig();
    config.setAnimationEnabled(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return config instance from getConfig', () => {
    const retrieved = controller.getConfig();
    expect(retrieved).toBe(config);
  });

  it('should fit perspective viewport to single mesh', () => {
    const viewport = createPerspectiveViewport();
    const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
    viewport.getScene().add(mesh);
    const count = controller.fitViewportToSelection(viewport, [mesh], config);
    expect(count).toBe(1);
  });

  it('should fit orthographic viewport to single mesh', () => {
    const viewport = createOrthographicViewport();
    const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
    viewport.getScene().add(mesh);
    const count = controller.fitViewportToSelection(viewport, [mesh], config);
    expect(count).toBe(1);
  });

  it('should fit all viewports to selection', () => {
    const vp3D = createPerspectiveViewport();
    const vp2D = createOrthographicViewport();
    const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
    vp3D.getScene().add(mesh);
    vp2D.getScene().add(mesh);
    const count = controller.fitAllViewportsToSelection([vp3D, vp2D], [mesh], config);
    expect(count).toBe(1);
  });

  it('should fall back to scene meshes when mesh array is empty', () => {
    const viewport = createPerspectiveViewport();
    const mesh1 = createBoxMesh(1, 1, 1, 0, 0, 0);
    const mesh2 = createBoxMesh(1, 1, 1, 5, 0, 0);
    viewport.getScene().add(mesh1);
    viewport.getScene().add(mesh2);
    const count = controller.fitViewportToSelection(viewport, [], config);
    expect(count).toBeGreaterThan(0);
  });

  it('should return zero count when no meshes and empty scene', () => {
    const viewport = createPerspectiveViewport();
    const count = controller.fitViewportToSelection(viewport, [], config);
    expect(count).toBe(0);
  });

  it('should update animations without throwing', () => {
    expect(() => controller.updateAnimations()).not.toThrow();
  });

  it('should frame multiple meshes correctly', () => {
    const viewport = createPerspectiveViewport();
    const meshA = createBoxMesh(1, 1, 1, -5, 0, 0);
    const meshB = createBoxMesh(1, 1, 1, 5, 0, 0);
    viewport.getScene().add(meshA);
    viewport.getScene().add(meshB);
    const count = controller.fitViewportToSelection(viewport, [meshA, meshB], config);
    expect(count).toBe(2);
  });

  it('should update orthographic animations over time', () => {
    config.setAnimationEnabled(true);
    config.setDurationMs(100);
    const viewport = createOrthographicViewport();
    const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
    viewport.getScene().add(mesh);
    controller.fitViewportToSelection(viewport, [mesh], config);
    advanceTime(200);
    controller.updateAnimations();
    expect(() => controller.updateAnimations()).not.toThrow();
  });

  it('should handle mixed viewport types', () => {
    const vp3D = createPerspectiveViewport();
    const vp2D = createOrthographicViewport();
    const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
    vp3D.getScene().add(mesh);
    vp2D.getScene().add(mesh);
    const count = controller.fitAllViewportsToSelection([vp3D, vp2D], [mesh], config);
    expect(count).toBe(1);
  });

  it('should handle empty viewport list', () => {
    const count = controller.fitAllViewportsToSelection([], [], config);
    expect(count).toBe(0);
  });

  it('should keep perspective camera on the same side after fit', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    const scene = new THREE.Scene();
    const viewport = {
      getCamera: () => camera,
      getScene: () => scene
    };
    const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
    scene.add(mesh);
    const startDir = camera.position.clone().normalize();
    controller.fitViewportToSelection(viewport, [mesh], config);
    const endDir = camera.position.clone().normalize();
    expect(endDir.dot(startDir)).toBeGreaterThan(0.99);
    expect(camera.position.length()).toBeGreaterThan(0.5);
  });
});

function createPerspectiveViewport() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(5, 5, 5);
  camera.lookAt(0, 0, 0);
  const scene = new THREE.Scene();
  return {
    getCamera: () => camera,
    getScene: () => scene
  };
}

function createOrthographicViewport() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  const scene = new THREE.Scene();
  return {
    getCamera: () => camera,
    getScene: () => scene
  };
}

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

function advanceTime(ms: number): void {
  vi.advanceTimersByTime(ms);
}
