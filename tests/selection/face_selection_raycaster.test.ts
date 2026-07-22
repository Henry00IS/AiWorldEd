import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FaceSelectionRaycaster } from '../../src/selection/face_selection_raycaster.js';

describe('FaceSelectionRaycaster', () => {
  let raycaster: FaceSelectionRaycaster;

  beforeEach(() => {
    raycaster = new FaceSelectionRaycaster();
  });

  it('should create without errors', () => {
    expect(raycaster).toBeDefined();
  });

  it('should return null when no meshes are provided', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.pickFace(event, camera, renderer, []);
    expect(result).toBeNull();
  });

  it('should return null when ray misses all meshes', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const offTargetMesh = createMeshAt(1, 1, 1, 10, 10, 0);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.pickFace(event, camera, renderer, [offTargetMesh]);
    expect(result).toBeNull();
  });

  it('should return the intersected mesh and face index on hit', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const targetMesh = createMeshAt(2, 2, 2, 0, 0, 0);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.pickFace(event, camera, renderer, [targetMesh]);
    expect(result).not.toBeNull();
    expect(result?.mesh).toBe(targetMesh);
    expect(result?.faceIndex).toBeGreaterThanOrEqual(0);
  });

  it('should return a valid hit point on intersection', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const targetMesh = createMeshAt(2, 2, 2, 0, 0, 0);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.pickFace(event, camera, renderer, [targetMesh]);
    expect(result).not.toBeNull();
    expect(result?.hitPoint).toBeInstanceOf(THREE.Vector3);
  });

  it('should return the closest mesh when multiple meshes intersect', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const nearMesh = createMeshAt(1, 1, 1, 0, 0, -1);
    const farMesh = createMeshAt(1, 1, 1, 0, 0, -4);
    const event = createMockMouseEvent(400, 300);
    const result = raycaster.pickFace(event, camera, renderer, [farMesh, nearMesh]);
    expect(result?.mesh).toBe(nearMesh);
  });

  it('should handle mouse offset from canvas position', () => {
    const canvas = createMockCanvasWithOffset(800, 600, 100, 50);
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const targetMesh = createMeshAt(2, 2, 2, 0, 0, 0);
    const event = createMockMouseEvent(500, 350);
    const result = raycaster.pickFace(event, camera, renderer, [targetMesh]);
    expect(result?.mesh).toBe(targetMesh);
  });

  it('should dispose without errors', () => {
    expect(() => raycaster.dispose()).not.toThrow();
  });
});

/**
 * Creates a mock canvas element with a defined bounding rect.
 * @param width The canvas width.
 * @param height The canvas height.
 * @returns A mock canvas element.
 */
function createMockCanvas(width: number, height: number): HTMLElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width, height }),
  });
  return canvas;
}

/**
 * Creates a mock canvas with offset in its bounding rect.
 * @param width The canvas width.
 * @param height The canvas height.
 * @param leftOffset The left offset.
 * @param topOffset The top offset.
 * @returns A mock canvas element.
 */
function createMockCanvasWithOffset(
  width: number, height: number, leftOffset: number, topOffset: number
): HTMLElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: leftOffset, top: topOffset, width, height }),
  });
  return canvas;
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
  sizeX: number, sizeY: number, sizeZ: number,
  posX: number, posY: number, posZ: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
    new THREE.MeshBasicMaterial()
  );
  mesh.position.set(posX, posY, posZ);
  mesh.updateMatrixWorld(true);
  return mesh;
}
