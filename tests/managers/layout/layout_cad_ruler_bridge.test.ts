import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  buildCadRulerBindingsFromViewports,
  reattachCadRulersToViewports,
} from '../../../src/managers/layout/layout_cad_ruler_bridge.js';
import { CadRulerSystem } from '../../../src/rulers/cad_ruler_system.js';
import { ViewportKind } from '../../../src/viewports/viewport_kind.js';
import type { EditorViewport } from '../../../src/viewports/editor_viewport.js';
import type { SelectionManager } from '../../../src/selection/object/selection_manager.js';

/**
 * Builds a minimal editor viewport stub for CAD binding tests.
 *
 * @param kind Viewport kind used for CAD view-plane mapping.
 * @param camera Camera attached to the binding.
 * @param container Content host for label overlays.
 * @returns Editor viewport stub.
 */
function createViewportStub(kind: ViewportKind, camera: THREE.Camera, container: HTMLElement): EditorViewport {
  const renderer = { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer;
  return {
    getViewportKind: () => kind,
    getCamera: () => camera,
    getRenderer: () => renderer,
    getContentElement: () => container,
  } as unknown as EditorViewport;
}

/**
 * Creates a box mesh at the origin for selection-dimension tests.
 *
 * @param size Full edge lengths.
 * @returns World mesh with updated matrices.
 */
function createBoxMesh(size: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('layout_cad_ruler_bridge', () => {
  it('should build one CAD binding per interactive viewport including detached panes', () => {
    const scene = new THREE.Scene();
    const mainContainer = document.createElement('div');
    const detachedContainer = document.createElement('div');
    const mainCamera = new THREE.PerspectiveCamera();
    const detachedCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const viewports = [
      createViewportStub(ViewportKind.PERSPECTIVE, mainCamera, mainContainer),
      createViewportStub(ViewportKind.TOP, detachedCamera, detachedContainer),
    ];
    const bindings = buildCadRulerBindingsFromViewports(scene, viewports);
    expect(bindings).toHaveLength(2);
    expect(bindings[0]?.camera).toBe(mainCamera);
    expect(bindings[0]?.container).toBe(mainContainer);
    expect(bindings[0]?.viewPlane).toBe('xyz');
    expect(bindings[0]?.scene).toBe(scene);
    expect(bindings[1]?.camera).toBe(detachedCamera);
    expect(bindings[1]?.container).toBe(detachedContainer);
    expect(bindings[1]?.viewPlane).toBe('xz');
  });

  it('should reattach rulers and rebuild selection dimensions for all bound viewports', () => {
    const scene = new THREE.Scene();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
    document.body.appendChild(container);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    const viewport = createViewportStub(ViewportKind.PERSPECTIVE, camera, container);
    const mesh = createBoxMesh(new THREE.Vector3(2, 1, 3));
    const cadRulerSystem = new CadRulerSystem();
    const host = {
      cadRulerSystem,
      rulerBoundsBuilder: { buildFromMeshes: vi.fn() },
      transformHandler: {},
      transformGizmo: {},
      selectionManager: {
        getAllSelectedObjectsAsArray: () => [mesh],
      } as unknown as SelectionManager,
      statusBar: null,
    };
    reattachCadRulersToViewports(host as never, scene, [viewport]);
    expect(cadRulerSystem.getViewportCount()).toBe(1);
    expect(cadRulerSystem.getDimensionSegmentCount()).toBeGreaterThan(0);
    cadRulerSystem.dispose();
    container.remove();
  });
});
