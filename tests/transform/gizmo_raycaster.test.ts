import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GizmoRaycaster } from '../../src/transform/gizmo_raycaster.js';
import { GizmoHandle } from '../../src/transform/gizmo_handle.js';
import { GizmoAxis } from '../../src/types/transform_mode.js';

describe('GizmoRaycaster', () => {
  let raycaster: GizmoRaycaster;
  let camera: THREE.PerspectiveCamera;
  let mockCanvas: { getBoundingClientRect: () => DOMRect };
  let mockRenderer: THREE.WebGLRenderer;

  beforeEach(() => {
    raycaster = new GizmoRaycaster();
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    mockCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    mockRenderer = { domElement: mockCanvas } as unknown as THREE.WebGLRenderer;
  });

  it('should create instance without errors', () => {
    const rc = new GizmoRaycaster();
    expect(rc).toBeDefined();
  });

  it('should dispose without errors', () => {
    const rc = new GizmoRaycaster();
    expect(() => rc.dispose()).not.toThrow();
  });

  it('should project mouse onto a plane perpendicular to camera through pivot', () => {
    const pivot = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(direction, pivot);
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const result = raycaster.projectMouseToPlane(camera, mockRenderer, event, plane);
    expect(result).not.toBeNull();
    const planeDistance = plane.distanceToPoint(result!);
    expect(planeDistance).toBeLessThan(0.01);
  });

  it('should project mouse onto a plane at an offset pivot', () => {
    const pivot = new THREE.Vector3(2, 3, 4);
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(direction, pivot);
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const result = raycaster.projectMouseToPlane(camera, mockRenderer, event, plane);
    expect(result).not.toBeNull();
    const planeDistance = plane.distanceToPoint(result!);
    expect(planeDistance).toBeLessThan(0.01);
  });

  it('should return null when ray is parallel to the plane', () => {
    const parallelPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100);
    const cameraAtOrigin = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    cameraAtOrigin.position.set(0, 0, 0);
    cameraAtOrigin.lookAt(1, 0, 0);
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const result = raycaster.projectMouseToPlane(cameraAtOrigin, mockRenderer, event, parallelPlane);
    expect(result).toBeNull();
  });

  it('should produce different results for different mouse positions', () => {
    const pivot = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(direction, pivot);
    const eventA = new MouseEvent('pointerdown', { clientX: 100, clientY: 100 });
    const eventB = new MouseEvent('pointerdown', { clientX: 700, clientY: 500 });
    const resultA = raycaster.projectMouseToPlane(camera, mockRenderer, eventA, plane);
    const resultB = raycaster.projectMouseToPlane(camera, mockRenderer, eventB, plane);
    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    const distance = resultA!.distanceTo(resultB!);
    expect(distance).toBeGreaterThan(0.1);
  });

  it('should produce accurate projection for center screen click on origin plane', () => {
    const cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 1000);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    const mockCanvasWide = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    };
    const mockRendererWide = { domElement: mockCanvasWide } as unknown as THREE.WebGLRenderer;
    const pivot = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(cam.quaternion).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(direction, pivot);
    const centerEvent = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const result = raycaster.projectMouseToPlane(cam, mockRendererWide, centerEvent, plane);
    expect(result).not.toBeNull();
    const originDistance = result!.distanceTo(new THREE.Vector3(0, 0, 0));
    expect(originDistance).toBeLessThan(0.5);
  });

  it('should not pick handles when the gizmo group is hidden', () => {
    const setup = createPickableGizmoSetup();
    setup.gizmoGroup.visible = false;
    setup.gizmoGroup.updateMatrixWorld(true);
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const result = raycaster.pickHandle(
      setup.handles,
      setup.camera,
      setup.renderer,
      event,
      setup.gizmoGroup
    );
    expect(result).toBeNull();
  });

  it('should pick a handle when the gizmo group is visible', () => {
    const setup = createPickableGizmoSetup();
    setup.gizmoGroup.visible = true;
    setup.gizmoGroup.updateMatrixWorld(true);
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const result = raycaster.pickHandle(
      setup.handles,
      setup.camera,
      setup.renderer,
      event,
      setup.gizmoGroup
    );
    expect(result).toBe(setup.handles[0]);
  });

  it('should pick a far handle through a nearer bounds face pick plane', () => {
    const setup = createFarHandleBehindFacePickSetup();
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const result = raycaster.pickHandle(
      setup.handles,
      setup.camera,
      setup.renderer,
      event,
      setup.gizmoGroup
    );
    expect(result).toBe(setup.handles[0]);
  });
});

/**
 * Builds a camera, renderer, handle, and gizmo group for pickHandle tests.
 * Places a large mesh at the origin so a center-screen ray intersects it.
 * @returns Fixtures for gizmo picking tests.
 */
function createPickableGizmoSetup(): {
  handles: GizmoHandle[];
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  gizmoGroup: THREE.Group;
} {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial()
  );
  const handle = new GizmoHandle(GizmoAxis.X, 0xff0000, mesh);
  mesh.userData.handleId = handle.getHandleId();
  const gizmoGroup = new THREE.Group();
  gizmoGroup.add(mesh);
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };
  const renderer = { domElement: canvas } as unknown as THREE.WebGLRenderer;
  return {
    handles: [handle],
    camera,
    renderer,
    gizmoGroup
  };
}

/**
 * Places a face-pick plane in front of a far handle so a center ray hits both.
 * Verifies handle picking ignores bounds face pick meshes.
 * @returns Fixtures with a far handle behind a face pick plane.
 */
function createFarHandleBehindFacePickSetup(): {
  handles: GizmoHandle[];
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  gizmoGroup: THREE.Group;
} {
  const facePick = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  facePick.position.set(0, 0, 1);
  facePick.userData.isBoundsFacePick = true;
  const handleMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
  handleMesh.position.set(0, 0, -2);
  const handle = new GizmoHandle(GizmoAxis.Z, 0x00ff00, handleMesh);
  handleMesh.userData.handleId = handle.getHandleId();
  const gizmoGroup = new THREE.Group();
  gizmoGroup.add(facePick);
  gizmoGroup.add(handleMesh);
  gizmoGroup.visible = true;
  gizmoGroup.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };
  const renderer = { domElement: canvas } as unknown as THREE.WebGLRenderer;
  return {
    handles: [handle],
    camera,
    renderer,
    gizmoGroup
  };
}
