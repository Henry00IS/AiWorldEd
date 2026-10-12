import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';

/** Minimal viewport surface that tracks camera access for hit resolution. */
class MockEditViewport {
  readonly camera: THREE.PerspectiveCamera;
  readonly contentElement: HTMLElement;
  cameraAccessCount = 0;

  /**
   * Creates a mock viewport in the given document.
   *
   * @param ownerDocument Document that owns the pick element.
   * @param bounds Optional fixed bounds for hit testing.
   */
  constructor(
    ownerDocument: Document = document,
    bounds: { left: number; top: number; width: number; height: number } = {
      left: 0,
      top: 0,
      width: 200,
      height: 200,
    },
  ) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    this.contentElement = ownerDocument.createElement('div');
    ownerDocument.body?.appendChild(this.contentElement);
    Object.defineProperty(this.contentElement, 'getBoundingClientRect', {
      value: () => ({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        right: bounds.left + bounds.width,
        bottom: bounds.top + bounds.height,
      }),
    });
  }

  /**
   * Returns the content pick element.
   *
   * @returns Pick element.
   */
  getContentElement(): HTMLElement {
    return this.contentElement;
  }

  /**
   * Returns the camera and records access for assertions.
   *
   * @returns Camera.
   */
  getCamera(): THREE.Camera {
    this.cameraAccessCount += 1;
    return this.camera;
  }
}

/**
 * Builds a triangle mesh with an edit document binding.
 *
 * @returns Mesh ready for Edit Mode.
 */
function createTriangleMesh(): THREE.Mesh {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(2, 0, 0);
  const c = builder.appendVertex(0, 2, 0);
  builder.appendFace([a, b, c]);
  const meshDocument = new MeshDocument(builder.build());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = meshDocument;
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('CoordinatorEditMode detached pointer document', () => {
  it('finds no pick surface when the detached viewport is omitted from getViewports', () => {
    const mesh = createTriangleMesh();
    const mainViewport = new MockEditViewport(document, { left: 0, top: 0, width: 400, height: 400 });
    const detachedDocument = document.implementation.createHTMLDocument('detached-viewport');
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => new THREE.Scene(),
      getSelectedObjects: () => [mesh],
      getViewports: () => [mainViewport],
      showStatusMessage: vi.fn(),
      getCommandStack: () => null,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    expect(coordinator.pickAtClientPoint(40, 50, false, false, detachedDocument)).toBe(false);
    expect(mainViewport.cameraAccessCount).toBe(0);
  });

  it('picks against the detached viewport when ownerDocument is set', () => {
    const mesh = createTriangleMesh();
    const mainViewport = new MockEditViewport(document, { left: 0, top: 0, width: 400, height: 400 });
    const detachedDocument = document.implementation.createHTMLDocument('detached-viewport');
    const detachedViewport = new MockEditViewport(detachedDocument, {
      left: 0,
      top: 0,
      width: 400,
      height: 400,
    });
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => new THREE.Scene(),
      getSelectedObjects: () => [mesh],
      getViewports: () => [mainViewport, detachedViewport],
      showStatusMessage: vi.fn(),
      getCommandStack: () => null,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    coordinator.pickAtClientPoint(40, 50, false, false, detachedDocument);
    expect(detachedViewport.cameraAccessCount).toBeGreaterThan(0);
    expect(mainViewport.cameraAccessCount).toBe(0);
  });

  it('does not fall back to the main viewport for detached coordinates near 0,0', () => {
    const mesh = createTriangleMesh();
    const mainViewport = new MockEditViewport(document, { left: 0, top: 0, width: 800, height: 600 });
    const detachedDocument = document.implementation.createHTMLDocument('detached-viewport');
    const detachedViewport = new MockEditViewport(detachedDocument, {
      left: 500,
      top: 500,
      width: 100,
      height: 100,
    });
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => new THREE.Scene(),
      getSelectedObjects: () => [mesh],
      getViewports: () => [mainViewport, detachedViewport],
      showStatusMessage: vi.fn(),
      getCommandStack: () => null,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    coordinator.pickAtClientPoint(10, 10, false, false, detachedDocument);
    expect(mainViewport.cameraAccessCount).toBe(0);
    expect(detachedViewport.cameraAccessCount).toBe(0);
  });
});
