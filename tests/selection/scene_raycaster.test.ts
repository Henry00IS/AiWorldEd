import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneRaycaster } from '../../src/selection/scene_raycaster.js';

describe('SceneRaycaster', () => {
  let raycaster: SceneRaycaster;

  beforeEach(() => {
    raycaster = new SceneRaycaster();
  });

  it('should create without errors', () => {
    expect(raycaster).toBeDefined();
  });

  it('should return null when no objects are provided', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.cast(camera, renderer, event, []);
    expect(result).toBeNull();
  });

  it('should return null when ray misses the target mesh', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const offTargetMesh = createMeshAt(0.5, 0.5, 0.5, 5, 5, -2);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.cast(camera, renderer, event, [offTargetMesh]);
    expect(result).toBeNull();
  });

  it('should return the intersected mesh when ray hits', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const targetMesh = createMeshAt(2, 2, 2, 0, 0, 0);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.cast(camera, renderer, event, [targetMesh]);
    expect(result).toBe(targetMesh);
  });

  it('should return the closest mesh when multiple meshes are intersected', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const nearMesh = createMeshAt(1, 1, 1, 0, 0, -1);
    const farMesh = createMeshAt(1, 1, 1, 0, 0, -4);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.cast(camera, renderer, event, [farMesh, nearMesh]);
    expect(result).toBe(nearMesh);
  });

  it('should handle mouse offset from canvas position', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 50, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const targetMesh = createMeshAt(2, 2, 2, 0, 0, 0);
    const event = createMockMouseEvent(500, 350);
    const result = raycaster.cast(camera, renderer, event, [targetMesh]);
    expect(result).toBe(targetMesh);
  });

  it('should dispose without errors', () => {
    expect(() => raycaster.dispose()).not.toThrow();
  });

  it('should pick a front-facing cube surface away from its center', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const targetMesh = createMeshAt(2, 2, 2, 0, 0, 0);
    const offCenterEvent = createMockMouseEvent(460, 280);
    const result = raycaster.cast(camera, renderer, offCenterEvent, [targetMesh]);
    expect(result).toBe(targetMesh);
  });

  it('should pick a back-facing plane with front-side material', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ side: THREE.FrontSide })
    );
    plane.position.set(0, 0, 0);
    plane.rotation.y = Math.PI;
    plane.updateMatrixWorld(true);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.cast(camera, renderer, event, [plane]);
    expect(result).toBe(plane);
  });

  it('should restore original material side after picking', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
    mesh.updateMatrixWorld(true);
    const event = createMockMouseEvent(400, 300);
    raycaster.cast(camera, renderer, event, [mesh]);
    expect(material.side).toBe(THREE.FrontSide);
  });
});

/**
 * Creates a mesh at a specific position with updated world matrix.
 * @param sizeX Width of the box along X.
 * @param sizeY Height of the box along Y.
 * @param sizeZ Depth of the box along Z.
 * @param posX X position.
 * @param posY Y position.
 * @param posZ Z position.
 * @returns A mesh with an updated world matrix.
 */
function createMeshAt(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  posX: number,
  posY: number,
  posZ: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
    new THREE.MeshBasicMaterial()
  );
  mesh.position.set(posX, posY, posZ);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Creates a mock WebGL renderer for testing.
 * @param canvas The mock canvas element.
 * @returns A mock renderer object.
 */
function createMockRenderer(canvas: HTMLElement): THREE.WebGLRenderer {
  return {
    domElement: canvas,
  } as unknown as THREE.WebGLRenderer;
}

/**
 * Creates a test camera positioned at origin looking down negative Z.
 * @returns A configured perspective camera.
 */
function createTestCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  return camera;
}

/**
 * Creates a mock mouse event with specified coordinates.
 * @param clientX The horizontal client coordinate.
 * @param clientY The vertical client coordinate.
 * @returns A mock MouseEvent.
 */
function createMockMouseEvent(clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent('click', {
    clientX,
    clientY,
    bubbles: true,
  });
  return event;
}
