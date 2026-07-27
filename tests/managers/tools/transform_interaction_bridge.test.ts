import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { TransformInteractionBridge } from '../../../src/managers/tools/transform_interaction_bridge.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { TransformMode } from '../../../src/types/transform_mode.js';
import { Theme } from '../../../src/theme.js';
import { TransformGizmo } from '../../../src/transform/gizmo/transform_gizmo.js';
import { GizmoRaycaster } from '../../../src/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '../../../src/transform/transform_executor.js';
import { TransformHandler } from '../../../src/transform/transform_handler.js';
import { TransformConstraint } from '../../../src/transform/transform_constraint.js';
import { GridSnap } from '../../../src/transform/snap/grid_snap.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { Viewport3D } from '../../../src/viewports/viewport_3d.js';
import { ViewportKind } from '../../../src/viewports/viewport_kind.js';

/** Minimal viewport stand-in used to drive transform bridge events. */
class MockViewport {
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private gizmoGroup: THREE.Group;

  /**
   * Creates a mock viewport with a bounds-capable gizmo group.
   *
   * @param gizmoGroup Visible gizmo group used for pick interactability.
   */
  constructor(gizmoGroup: THREE.Group, camera: THREE.Camera = createPerspectiveCamera()) {
    this.camera = camera;
    this.camera.updateMatrixWorld(true);
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      width: 800,
      height: 600,
    };
    this.renderer = { domElement: canvas } as unknown as THREE.WebGLRenderer;
    this.gizmoGroup = gizmoGroup;
    this.gizmoGroup.visible = true;
    this.gizmoGroup.updateMatrixWorld(true);
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getContentElement(): HTMLElement {
    return this.renderer.domElement as HTMLElement;
  }

  getGizmoGroup(): THREE.Group {
    return this.gizmoGroup;
  }

  getViewportKind(): ViewportKind {
    return ViewportKind.PERSPECTIVE;
  }
}

describe('TransformInteractionBridge', () => {
  let selectionManager: SelectionManager;
  let transformGizmo: TransformGizmo;
  let transformHandler: TransformHandler;
  let viewport: MockViewport;
  let mesh: THREE.Mesh;

  beforeEach(() => {
    selectionManager = new SelectionManager();
    mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    selectionManager.selectObject(mesh);
    transformGizmo = new TransformGizmo(Theme);
    transformGizmo.setMode(TransformMode.BOUNDS);
    transformGizmo.setVisible(true);
    transformGizmo.updateBoundsFromMeshes([mesh]);
    const gridSnap = new GridSnap(false, 1);
    const executor = new TransformExecutor(gridSnap);
    transformHandler = new TransformHandler(
      transformGizmo,
      new GizmoRaycaster(),
      executor,
      new TransformConstraint(),
      new CommandStack(16),
    );
    const gizmoGroup = transformGizmo.getHandleGroupClone();
    viewport = new MockViewport(gizmoGroup);
  });

  it('should not start transform interaction when interaction is disabled', () => {
    const bridge = createBridge(() => false);
    const onPointerDown = vi.spyOn(transformHandler, 'onPointerDown');
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const consumed = bridge.onTransformEvent(event, viewport as unknown as Viewport3D);
    expect(consumed).toBe(false);
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(transformHandler.isDragging()).toBe(false);
  });

  it('should allow transform interaction when interaction is enabled', () => {
    const bridge = createBridge(() => true);
    const onPointerDown = vi.spyOn(transformHandler, 'onPointerDown');
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    bridge.onTransformEvent(event, viewport as unknown as Viewport3D);
    expect(onPointerDown).toHaveBeenCalled();
  });

  it('should treat omitted isInteractionEnabled as always enabled', () => {
    const bridge = createBridge(undefined);
    const onPointerDown = vi.spyOn(transformHandler, 'onPointerDown');
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    bridge.onTransformEvent(event, viewport as unknown as Viewport3D);
    expect(onPointerDown).toHaveBeenCalled();
  });

  it('should end a bounds drag when pointerup fires on window outside the canvas', () => {
    const bridge = createBridge(() => true);
    const downEvent = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    const started = bridge.onTransformEvent(downEvent, viewport as unknown as Viewport3D);
    expect(started).toBe(true);
    expect(transformHandler.isDragging()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
    expect(transformHandler.isDragging()).toBe(false);
  });

  it('should not resume dragging after window release when viewport receives move', () => {
    const bridge = createBridge(() => true);
    const typedViewport = viewport as unknown as Viewport3D;
    const downEvent = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    bridge.onTransformEvent(downEvent, typedViewport);
    expect(transformHandler.isDragging()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
    const moveEvent = new MouseEvent('pointermove', { clientX: 450, clientY: 320 });
    const moveConsumed = bridge.onTransformEvent(moveEvent, typedViewport);
    expect(moveConsumed).toBe(false);
    expect(transformHandler.isDragging()).toBe(false);
  });

  it('should forward window pointermove to the transform handler while dragging', () => {
    const bridge = createBridge(() => true);
    const onPointerMove = vi.spyOn(transformHandler, 'onPointerMove');
    const downEvent = new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
    bridge.onTransformEvent(downEvent, viewport as unknown as Viewport3D);
    expect(transformHandler.isDragging()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 420, clientY: 310 }));
    expect(onPointerMove).toHaveBeenCalled();
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  });

  it('duplicates the selection before starting a valid Alt-drag', () => {
    const duplicate = mesh.clone();
    const onDuplicateSelectedForDrag = vi.fn(() => selectionManager.setSelection([duplicate]));
    const bridge = createBridge(() => true, onDuplicateSelectedForDrag);
    const onPointerDown = vi.spyOn(transformHandler, 'onPointerDown');
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300, altKey: true });
    const consumed = bridge.onTransformEvent(event, viewport as unknown as Viewport3D);
    expect(consumed).toBe(true);
    expect(onDuplicateSelectedForDrag).toHaveBeenCalledOnce();
    expect(onPointerDown).toHaveBeenCalledTimes(2);
    expect(onPointerDown.mock.calls[1]?.[4]).toEqual([duplicate]);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  });

  it('does not duplicate when Alt is pressed away from a transform target', () => {
    const onDuplicateSelectedForDrag = vi.fn();
    const bridge = createBridge(() => true, onDuplicateSelectedForDrag);
    const event = new MouseEvent('pointerdown', { clientX: 0, clientY: 0, altKey: true });
    const consumed = bridge.onTransformEvent(event, viewport as unknown as Viewport3D);
    expect(consumed).toBe(false);
    expect(onDuplicateSelectedForDrag).not.toHaveBeenCalled();
  });

  it('duplicates the selection before starting an orthographic Alt-drag', () => {
    const duplicate = mesh.clone();
    const orthoGroup = transformGizmo.getHandleGroupClone('xz');
    viewport = new MockViewport(orthoGroup, createTopOrthographicCamera());
    const onDuplicateSelectedForDrag = vi.fn(() => {
      selectionManager.setSelection([duplicate]);
      transformGizmo.updateBoundsFromMeshes([duplicate]);
    });
    const bridge = createBridge(() => true, onDuplicateSelectedForDrag);
    const event = new MouseEvent('pointerdown', { clientX: 400, clientY: 300, altKey: true });
    const consumed = bridge.onTransformEvent(event, viewport as unknown as Viewport3D);
    expect(consumed).toBe(true);
    expect(onDuplicateSelectedForDrag).toHaveBeenCalledOnce();
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  });

  /**
   * Builds a bridge with shared test fixtures.
   *
   * @param isInteractionEnabled Optional gate for transform picks.
   * @returns Configured TransformInteractionBridge.
   */
  function createBridge(
    isInteractionEnabled: (() => boolean) | undefined,
    onDuplicateSelectedForDrag?: () => void,
  ): TransformInteractionBridge {
    const deps: ConstructorParameters<typeof TransformInteractionBridge>[0] = {
      selectionManager,
      selectionVisualController: {
        syncDuringTransform: () => undefined,
      } as never,
      transformGizmo,
      transformHandler,
      transformExecutor: new TransformExecutor(new GridSnap(false, 1)),
      gridSnap: new GridSnap(false, 1),
      inputManager: { isShiftDown: () => false } as never,
      viewportSyncManager: {
        syncClonePositionsToWorldObject: () => undefined,
        syncCloneTransformsForWorldObjects: () => undefined,
      } as never,
      propertiesPanel: { refreshBoundObject: () => undefined } as never,
      worldObject: new THREE.Group(),
      viewport3D: {
        getCamera: () => viewport.getCamera(),
      } as never,
      getUserSnapEnabled: () => false,
      isTransformSpaceLocal: () => false,
      onAfterTransformCommit: () => undefined,
    };
    if (isInteractionEnabled !== undefined) {
      deps.isInteractionEnabled = isInteractionEnabled;
    }
    if (onDuplicateSelectedForDrag !== undefined) {
      deps.onDuplicateSelectedForDrag = onDuplicateSelectedForDrag;
    }
    return new TransformInteractionBridge(deps);
  }
});

/** @returns Perspective camera centered on the test selection. */
function createPerspectiveCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  return camera;
}

/** @returns Top orthographic camera centered on the test selection. */
function createTopOrthographicCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  return camera;
}
