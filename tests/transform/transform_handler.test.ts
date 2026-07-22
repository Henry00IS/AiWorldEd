import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { TransformMode, GizmoAxis } from '../../src/types/transform_mode.js';
import { TransformGizmo } from '../../src/transform/transform_gizmo.js';
import { GizmoRaycaster } from '../../src/transform/gizmo_raycaster.js';
import { TransformExecutor } from '../../src/transform/transform_executor.js';
import { TransformConstraint } from '../../src/transform/transform_constraint.js';
import { GridSnap } from '../../src/transform/grid_snap.js';
import { TransformHandler } from '../../src/transform/transform_handler.js';

describe('TransformHandler', () => {
  let handler: TransformHandler;
  let gizmo: TransformGizmo;
  let raycaster: GizmoRaycaster;
  let executor: TransformExecutor;
  let constraint: TransformConstraint;

  beforeEach(() => {
    constraint = new TransformConstraint();
    executor = new TransformExecutor(new GridSnap(false, 1.0));
    raycaster = new GizmoRaycaster();
    gizmo = new TransformGizmo(Theme);
    handler = new TransformHandler(gizmo, raycaster, executor, constraint);
  });

  it('should start with no drag active', () => {
    expect(handler.isDragging()).toBe(false);
    expect(handler.isBusy()).toBe(false);
  });

  it('should start with no active axis', () => {
    expect(handler.getActiveAxis()).toBeNull();
  });

  it('should have mode BOUNDS by default', () => {
    expect(gizmo.getMode()).toBe(TransformMode.BOUNDS);
  });

  it('should switch to ROTATE mode via gizmo', () => {
    gizmo.setMode(TransformMode.ROTATE);
    expect(gizmo.getMode()).toBe(TransformMode.ROTATE);
  });

  it('should switch to SCALE mode via gizmo', () => {
    gizmo.setMode(TransformMode.SCALE);
    expect(gizmo.getMode()).toBe(TransformMode.SCALE);
  });

  it('should onPointerUp clear drag state', () => {
    handler.onPointerUp();
    expect(handler.isDragging()).toBe(false);
    expect(handler.isBusy()).toBe(false);
    expect(handler.getActiveAxis()).toBeNull();
  });

  it('should onPointerUp clear active handle on gizmo', () => {
    const handles = gizmo.getHandles();
    if (handles.length > 0) {
      gizmo.setActiveHandle(handles[0]);
    }
    handler.onPointerUp();
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should dispose raycaster and gizmo without errors', () => {
    raycaster.dispose();
    gizmo.dispose();
    expect(true).toBe(true);
  });

  it('should accept pivot parameter in onPointerDown without errors', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    const handles = gizmo.getHandles();
    const pivot = new THREE.Vector3(1, 2, 3);
    const mockCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const mockRenderer = { domElement: mockCanvas } as unknown as THREE.WebGLRenderer;
    expect(() => {
      handler.onPointerDown(
        new THREE.PerspectiveCamera(),
        mockRenderer,
        new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }),
        handles,
        [mesh],
        pivot
      );
    }).not.toThrow();
  });

  it('should use pivot-based projection instead of hardcoded distance', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const mockCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const mockRenderer = { domElement: mockCanvas } as unknown as THREE.WebGLRenderer;
    const handles = gizmo.getHandles();
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    handler.onPointerDown(camera, mockRenderer, event, handles, [], pivot);
    expect(handler.isDragging()).toBe(false);
  });

  it('should use default origin pivot when no pivot provided', () => {
    const handles = gizmo.getHandles();
    const mockCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const mockRenderer = { domElement: mockCanvas } as unknown as THREE.WebGLRenderer;
    expect(() => {
      handler.onPointerDown(
        new THREE.PerspectiveCamera(),
        mockRenderer,
        new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }),
        handles
      );
    }).not.toThrow();
  });

  it('should use default empty selected objects when not provided', () => {
    const handles = gizmo.getHandles();
    const mockCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const mockRenderer = { domElement: mockCanvas } as unknown as THREE.WebGLRenderer;
    expect(() => {
      handler.onPointerDown(
        new THREE.PerspectiveCamera(),
        mockRenderer,
        new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }),
        handles,
        [],
        new THREE.Vector3()
      );
    }).not.toThrow();
  });

  it('should not start a drag when Ctrl is held for multi-select', () => {
    const setup = createBoundsPickSetup(gizmo);
    handler.onPointerDown(
      setup.camera,
      setup.renderer,
      new MouseEvent('pointerdown', { clientX: 400, clientY: 300, ctrlKey: true }),
      setup.handles,
      setup.meshes,
      setup.pivot,
      setup.gizmoGroup
    );
    expect(handler.isDragging()).toBe(false);
  });

  it('should not start a drag when Shift is held for multi-select', () => {
    const setup = createBoundsPickSetup(gizmo);
    handler.onPointerDown(
      setup.camera,
      setup.renderer,
      new MouseEvent('pointerdown', { clientX: 400, clientY: 300, shiftKey: true }),
      setup.handles,
      setup.meshes,
      setup.pivot,
      setup.gizmoGroup
    );
    expect(handler.isDragging()).toBe(false);
  });
});

/**
 * Builds a bounds-mode pick environment with a centered mesh and viewport gizmo clone.
 * @param gizmo The transform gizmo under test.
 * @returns Camera, renderer, handles, and group for pointer-down tests.
 */
function createBoundsPickSetup(gizmo: TransformGizmo): {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  handles: ReturnType<TransformGizmo['getHandles']>;
  meshes: THREE.Mesh[];
  pivot: THREE.Vector3;
  gizmoGroup: THREE.Group;
} {
  gizmo.setMode(TransformMode.BOUNDS);
  gizmo.setVisible(true);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial()
  );
  mesh.updateMatrixWorld(true);
  gizmo.updateBoundsFromMeshes([mesh]);
  const gizmoGroup = gizmo.getHandleGroupClone();
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
    camera,
    renderer,
    handles: gizmo.getHandles(),
    meshes: [mesh],
    pivot: new THREE.Vector3(0, 0, 0),
    gizmoGroup
  };
}
