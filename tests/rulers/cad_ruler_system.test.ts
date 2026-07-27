import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CadRulerSystem } from '../../src/rulers/cad_ruler_system.js';
import type { OrientedBoundsData } from '../../src/transform/bounds/oriented_bounds.js';

/**
 * Creates a mesh with box geometry at the given center and size.
 *
 * @param center World center.
 * @param size Full edge lengths.
 * @returns Mesh ready for bounds measurement.
 */
function createBoxMesh(center: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds oriented bounds for tests.
 *
 * @param center Bounds center.
 * @param half Half extents.
 * @returns Oriented bounds data.
 */
function makeBounds(center: THREE.Vector3, half: THREE.Vector3): OrientedBoundsData {
  return {
    center: center.clone(),
    quaternion: new THREE.Quaternion(),
    halfExtents: half.clone(),
  };
}

/**
 * Creates a mock WebGL renderer with a canvas-like dom element.
 *
 * @param canvas Host canvas element.
 * @returns Renderer stub suitable for label projection metrics.
 */
function createMockRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  Object.defineProperty(canvas, 'clientWidth', { value: 200, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 200, configurable: true });
  return { domElement: canvas } as unknown as THREE.WebGLRenderer;
}

describe('CadRulerSystem', () => {
  let system: CadRulerSystem;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let container: HTMLDivElement;

  beforeEach(() => {
    system = new CadRulerSystem();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    container = document.createElement('div');
    container.style.width = '200px';
    container.style.height = '200px';
    document.body.appendChild(container);
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    renderer = createMockRenderer(canvas);
    system.attachViewports([{ scene, camera, renderer, container, viewPlane: 'xyz' }]);
  });

  afterEach(() => {
    system.dispose();
    container.remove();
  });

  it('should attach one viewport renderer', () => {
    expect(system.getViewportCount()).toBe(1);
  });

  it('disables ruler depth darkening for orthographic multi-view passes', () => {
    const mesh = createBoxMesh(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(2, 1, 3));
    system.setSelectionMeshes([mesh]);
    system.prepareForCamera(camera);
    expect(system.isDepthOcclusionEnabled()).toBe(true);
    const orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    orthoCamera.position.set(0, 20, 0);
    orthoCamera.lookAt(0, 0, 0);
    system.attachViewports([{ scene, camera: orthoCamera, renderer, container, viewPlane: 'xz' }]);
    system.setSelectionMeshes([mesh]);
    system.prepareForCamera(orthoCamera);
    expect(system.isDepthOcclusionEnabled()).toBe(false);
    system.attachViewports([{ scene, camera, renderer, container, viewPlane: 'xyz' }]);
    system.setSelectionMeshes([mesh]);
    system.prepareForCamera(camera);
    expect(system.isDepthOcclusionEnabled()).toBe(true);
  });

  it('should build size dimensions when a mesh is selected', () => {
    const mesh = createBoxMesh(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(2, 1, 3));
    system.setSelectionMeshes([mesh]);
    expect(system.getDimensionSegmentCount()).toBeGreaterThan(0);
    const labels = system.getLabels();
    expect(labels.length).toBeGreaterThanOrEqual(3);
    const texts = labels.map((label) => label.text);
    expect(texts).toContain('2');
    expect(texts).toContain('1');
    expect(texts).toContain('3');
  });

  it('should clear dimensions when selection is emptied', () => {
    const mesh = createBoxMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    system.setSelectionMeshes([mesh]);
    system.setSelectionMeshes([]);
    expect(system.getDimensionSegmentCount()).toBe(0);
    expect(system.getLabels()).toHaveLength(0);
  });

  it('should show ghost bounds and translate delta labels while translating', () => {
    const start = makeBounds(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0.5, 0.5));
    system.beginDrag(start, 'translate');
    system.updateTranslateDrag(new THREE.Vector3(2, 0, 0), start);
    expect(system.isDragActive()).toBe(true);
    expect(system.getDragMode()).toBe('translate');
    expect(system.getGhostSegmentCount()).toBe(12);
    expect(system.getLabels().some((label) => label.id === 'delta-x')).toBe(true);
    expect(system.getLabels().some((label) => label.id === 'delta-total')).toBe(false);
    expect(system.getLabels().some((label) => label.id === 'delta-z')).toBe(false);
    expect(system.getStatusText().length).toBeGreaterThan(0);
  });

  it('should show only X face-travel labels for one-sided X resize', () => {
    const start = makeBounds(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    const current = makeBounds(new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 1, 1));
    system.beginDrag(start, 'resize');
    system.updateResizeDrag(current);
    expect(system.getDragMode()).toBe('resize');
    expect(system.getGhostSegmentCount()).toBe(12);
    const resizeIds = system
      .getLabels()
      .map((label) => label.id)
      .filter((id) => id.startsWith('resize-'));
    expect(resizeIds.length).toBeGreaterThan(0);
    expect(resizeIds.every((id) => id.includes('-0'))).toBe(true);
    expect(system.getStatusText()).toContain('Size Δ');
  });

  it('should restore selection-only dimensions after endDrag', () => {
    const mesh = createBoxMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    system.setSelectionMeshes([mesh]);
    const start = makeBounds(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0.5, 0.5));
    system.beginDrag(start, 'translate');
    system.updateTranslateDrag(new THREE.Vector3(1, 0, 0));
    system.endDrag();
    expect(system.isDragActive()).toBe(false);
    expect(system.getGhostSegmentCount()).toBe(0);
    expect(system.getDimensionSegmentCount()).toBeGreaterThan(0);
  });

  it('should not allocate work for unselected scene content', () => {
    const many: THREE.Mesh[] = [];
    for (let index = 0; index < 50; index += 1) {
      many.push(createBoxMesh(new THREE.Vector3(index, 0, 0), new THREE.Vector3(1, 1, 1)));
    }
    system.setSelectionMeshes([]);
    expect(system.getDimensionSegmentCount()).toBe(0);
    system.setSelectionMeshes([many[0]!]);
    const selectedCount = system.getDimensionSegmentCount();
    system.setSelectionMeshes([many[0]!, many[1]!]);
    expect(system.getDimensionSegmentCount()).toBeGreaterThan(0);
    expect(selectedCount).toBeGreaterThan(0);
  });

  it('should dispose cleanly', () => {
    const mesh = createBoxMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    system.setSelectionMeshes([mesh]);
    expect(() => system.dispose()).not.toThrow();
    expect(system.getViewportCount()).toBe(0);
  });
});
