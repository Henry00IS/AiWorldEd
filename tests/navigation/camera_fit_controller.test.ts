import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('should publish the computed perspective look target as navigation focus', () => {
    const viewport = createPerspectiveViewport();
    const focus = new THREE.Vector3();
    viewport.setNavigationFocus = (nextFocus: THREE.Vector3) => focus.copy(nextFocus);
    const mesh = createBoxMesh(2, 4, 6, 9, -2, 3);

    controller.fitViewportToSelection(viewport, [mesh], config);

    expect(focus.distanceTo(new THREE.Vector3(9, -2, 3))).toBeLessThan(0.001);
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

  it('should ignore origin gizmo meshes when falling back with no selection', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    world.name = 'world';
    const content = createBoxMesh(2, 2, 2, 100, 0, 0);
    world.add(content);
    scene.add(world);
    const gizmo = new THREE.Group();
    gizmo.name = 'transform_gizmo_viewport';
    gizmo.add(createBoxMesh(4, 4, 4, 0, 0, 0));
    scene.add(gizmo);
    const viewport = {
      getCamera: () => camera,
      getScene: () => scene,
      collectSelectableObjects: () => collectMeshesUnderGroup(world),
    };
    const count = controller.fitViewportToSelection(viewport, [], config);
    expect(count).toBe(1);
    expect(camera.position.x).toBeGreaterThan(50);
  });

  it('should ignore empty solid result meshes at the model origin', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    const scene = new THREE.Scene();
    const model = new THREE.Group();
    model.name = 'DefaultModel';
    model.position.set(0, 0, 0);
    const emptyResult = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)),
      new THREE.MeshBasicMaterial(),
    );
    emptyResult.name = 'Result';
    emptyResult.userData['isSolidModelResult'] = true;
    const farBrush = createBoxMesh(2, 2, 2, 80, 0, 0);
    farBrush.userData['isSolidBrush'] = true;
    model.add(emptyResult);
    model.add(farBrush);
    scene.add(model);
    const viewport = {
      getCamera: () => camera,
      getScene: () => scene,
      collectSelectableObjects: () =>
        collectMeshesUnderGroup(model).filter((mesh) => mesh.userData['isSolidModelResult'] !== true),
    };
    const count = controller.fitViewportToSelection(viewport, [], config);
    expect(count).toBe(1);
    expect(camera.position.x).toBeGreaterThan(40);
  });

  it('should ignore scene overlays when collectSelectableObjects is unavailable', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    const scene = new THREE.Scene();
    const content = createBoxMesh(2, 2, 2, 60, 0, 0);
    scene.add(content);
    const gizmo = new THREE.Group();
    gizmo.name = 'transform_gizmo';
    gizmo.add(createBoxMesh(10, 10, 10, 0, 0, 0));
    scene.add(gizmo);
    const viewport = {
      getCamera: () => camera,
      getScene: () => scene,
    };
    const count = controller.fitViewportToSelection(viewport, [], config);
    expect(count).toBe(1);
    expect(camera.position.x).toBeGreaterThan(30);
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
      getScene: () => scene,
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
    getScene: () => scene,
    setNavigationFocus: (_focus: THREE.Vector3): void => {},
  };
}

function createOrthographicViewport() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  const scene = new THREE.Scene();
  return {
    getCamera: () => camera,
    getScene: () => scene,
  };
}

/**
 * Creates a unit-style box mesh at a world position.
 *
 * @param width Box width.
 * @param height Box height.
 * @param depth Box depth.
 * @param px World X.
 * @param py World Y.
 * @param pz World Z.
 * @returns Configured mesh.
 */
function createBoxMesh(width: number, height: number, depth: number, px: number, py: number, pz: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  return mesh;
}

/**
 * Collects meshes under a group for fit fallback tests.
 *
 * @param root Hierarchy root.
 * @returns Mesh descendants and root when it is a mesh.
 */
function collectMeshesUnderGroup(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

/**
 * Advances fake timers for animation tests.
 *
 * @param ms Milliseconds to advance.
 */
function advanceTime(ms: number): void {
  vi.advanceTimersByTime(ms);
}
