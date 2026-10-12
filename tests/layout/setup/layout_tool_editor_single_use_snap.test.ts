import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { createLayoutToolEditorSystem } from '@/layout/setup/layout_tool_editor_setup.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ManagerInput } from '@/input/manager_input.js';
import { Theme } from '@/theme.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { TransformConstraint } from '@/transform/core/transform_constraint.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CommandStack } from '@/commands/command_stack.js';
import { TransformMode } from '@/types/transform_mode.js';
import { HandlerComponentTransform } from '@/edit/transform/handler_component_transform.js';
import type { Viewport2D } from '@/viewports/core/viewport_2d.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';

describe('layout tool editor single-use Shift snap precision', () => {
  let gridSnap: GridSnap;
  let inputManager: ManagerInput;
  let selectionManager: ManagerSelection;
  let transformHandler: HandlerTransform;
  let transformGizmo: GizmoTransform;
  let mesh: THREE.Mesh;
  let pickElement: HTMLElement;
  let camera: THREE.PerspectiveCamera;
  let services: ReturnType<typeof createLayoutToolEditorSystem>['editorWindow'] extends {
    getServices(): infer S;
  }
    ? NonNullable<S>
    : never;

  beforeEach(() => {
    gridSnap = new GridSnap(true, 1);
    inputManager = new ManagerInput();
    selectionManager = new ManagerSelection();
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.set(0.4, 0, 0);
    mesh.updateMatrixWorld(true);
    selectionManager.selectObject(mesh);
    transformGizmo = new GizmoTransform(Theme);
    transformGizmo.setMode(TransformMode.TRANSLATE);
    const executor = new TransformExecutor(gridSnap);
    transformHandler = new HandlerTransform(
      transformGizmo,
      new GizmoRaycaster(),
      executor,
      new TransformConstraint(),
      new CommandStack(16),
    );
    pickElement = document.createElement('div');
    Object.defineProperty(pickElement, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    });
    camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const system = createLayoutToolEditorSystem({
      transformHandler,
      componentTransformHandler: new HandlerComponentTransform(gridSnap, new CommandStack(16)),
      transformGizmo,
      selectionManager,
      inputManager,
      gridSnap,
      getUserSnapEnabled: () => true,
      getActiveViewport: () =>
        ({
          getCamera: () => camera,
          getContentElement: () => pickElement,
        }) as never,
      getInteractiveViewports: () => [],
      getTransformPivot: () => new THREE.Vector3(0, 0, 0),
      setStatusMessage: () => undefined,
      refreshGizmoPresentation: () => undefined,
      onAfterTransformCommit: () => undefined,
    });
    const resolved = system.editorWindow.getServices();
    if (!resolved) {
      throw new Error('expected editor services');
    }
    services = resolved as typeof services;
  });

  afterEach(() => {
    inputManager.dispose();
  });

  it('does not inherit sticky snap-off from a prior Shift-disabled sample when Shift is up', () => {
    gridSnap.setEnabled(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    const started = services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    expect(started).toBe(true);
    expect(gridSnap.isEnabled()).toBe(true);
    services.applySingleUsePointerMove(420, 310, camera, pickElement);
    expect(gridSnap.isEnabled()).toBe(true);
    services.cancelActiveTransformDrag();
  });

  it('disables snap while Shift is held during single-use pointer samples', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    const started = services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    expect(started).toBe(true);
    expect(gridSnap.isEnabled()).toBe(false);
    services.applySingleUsePointerMove(420, 310, camera, pickElement);
    expect(gridSnap.isEnabled()).toBe(false);
    services.cancelActiveTransformDrag();
  });

  it('restores user snap preference when single-use drag commits or cancels', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    expect(gridSnap.isEnabled()).toBe(false);
    services.cancelActiveTransformDrag();
    expect(gridSnap.isEnabled()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    services.commitActiveTransformDrag();
    expect(gridSnap.isEnabled()).toBe(true);
  });

  it('toggles grid snap from Shift during edit-mode single-use grab, rotate, and scale', () => {
    const editMesh = createEditableTriangleMesh();
    const editServices = createEditModeSnapServices(editMesh);
    expectShiftTogglesSnap(editServices, editMesh, TransformMode.TRANSLATE);
    expectShiftTogglesSnap(editServices, editMesh, TransformMode.ROTATE);
    expectShiftTogglesSnap(editServices, editMesh, TransformMode.SCALE);
  });

  /**
   * Builds tool services whose edit-mode coordinator exposes one mesh vertex.
   *
   * @param editMesh Mesh that owns the selected vertex.
   * @returns Editor services for a component single-use drag.
   */
  function createEditModeSnapServices(editMesh: THREE.Mesh): typeof services {
    const system = createLayoutToolEditorSystem(createEditModeSnapDeps(editMesh));
    const resolved = system.editorWindow.getServices();
    if (!resolved) {
      throw new Error('expected editor services');
    }
    return resolved as typeof services;
  }

  /**
   * Builds layout deps for an edit-mode single-use snap drag.
   *
   * @param editMesh Mesh that owns the selected vertex.
   * @returns Layout tool editor deps.
   */
  function createEditModeSnapDeps(editMesh: THREE.Mesh): Parameters<typeof createLayoutToolEditorSystem>[0] {
    return {
      transformHandler,
      componentTransformHandler: new HandlerComponentTransform(gridSnap, new CommandStack(16)),
      transformGizmo,
      selectionManager,
      inputManager,
      gridSnap,
      getUserSnapEnabled: () => true,
      getActiveViewport: () => createSnapViewportStub(),
      getInteractiveViewports: () => [],
      getTransformPivot: () => new THREE.Vector3(0, 0, 0),
      setStatusMessage: () => undefined,
      refreshGizmoPresentation: () => undefined,
      onAfterTransformCommit: () => undefined,
      getEditModeCoordinator: () => createActiveVertexCoordinator(editMesh),
    };
  }

  /**
   * Builds the active viewport stub used by single-use snap drags.
   *
   * @returns Viewport double.
   */
  function createSnapViewportStub(): Viewport3D | Viewport2D {
    return {
      getCamera: () => camera,
      getContentElement: () => pickElement,
    } as Viewport3D;
  }

  /**
   * Checks that Shift disables snap during a drag and releasing Shift restores
   * it.
   *
   * @param editServices Editor services under test.
   * @param editMesh Transform target passed to the single-use drag.
   * @param mode Grab, rotate, or scale mode.
   */
  function expectShiftTogglesSnap(editServices: typeof services, editMesh: THREE.Mesh, mode: TransformMode): void {
    releaseShift();
    const started = beginEditSingleUseDrag(editServices, editMesh, mode);
    expect(started).toBe(true);
    expectSnapAfterPointerMove(editServices, 420, 310, true);
    holdShift();
    expectSnapAfterPointerMove(editServices, 440, 320, false);
    releaseShift();
    expectSnapAfterPointerMove(editServices, 460, 330, true);
    editServices.cancelActiveTransformDrag();
  }

  /**
   * Starts one edit-mode single-use drag.
   *
   * @param editServices Editor services under test.
   * @param editMesh Transform target.
   * @param mode Grab, rotate, or scale mode.
   * @returns True when the drag started.
   */
  function beginEditSingleUseDrag(editServices: typeof services, editMesh: THREE.Mesh, mode: TransformMode): boolean {
    return editServices.beginSingleUseDrag(mode, [editMesh], new THREE.Vector3(0, 0, 0), camera, pickElement, 400, 300);
  }

  /**
   * Samples a pointer move and checks the live grid-snap enabled flag.
   *
   * @param editServices Editor services under test.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param snapEnabled Expected snap state after the sample.
   */
  function expectSnapAfterPointerMove(
    editServices: typeof services,
    clientX: number,
    clientY: number,
    snapEnabled: boolean,
  ): void {
    editServices.applySingleUsePointerMove(clientX, clientY, camera, pickElement);
    expect(gridSnap.isEnabled()).toBe(snapEnabled);
  }

  /** Records Shift as released. */
  function releaseShift(): void {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
  }

  /** Records Shift as held. */
  function holdShift(): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  }
});

/**
 * Builds a triangle mesh whose document can supply an edit-mode vertex.
 *
 * @returns Display mesh with a bound document.
 */
function createEditableTriangleMesh(): THREE.Mesh {
  const builder = new MeshTopologyBuilder();
  const first = builder.appendVertex(0, 0, 0);
  const second = builder.appendVertex(2, 0, 0);
  const third = builder.appendVertex(0, 2, 0);
  builder.appendFace([first, second, third]);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = new MeshDocument(builder.build());
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Opens Edit Mode on one mesh and selects its first vertex.
 *
 * @param editMesh Mesh that owns the selected vertex.
 * @returns Active coordinator.
 */
function createActiveVertexCoordinator(editMesh: THREE.Mesh): CoordinatorEditMode {
  const scene = new THREE.Scene();
  scene.add(editMesh);
  const coordinator = new CoordinatorEditMode({
    getPrimaryScene: () => scene,
    getSelectedObjects: () => [editMesh],
    getViewports: () => [],
    showStatusMessage: () => undefined,
    getCommandStack: () => null,
  });
  coordinator.enterFromObjectSelection();
  selectFirstVertex(coordinator, editMesh);
  return coordinator;
}

/**
 * Selects vertex 0 on a content mesh that is already in Edit Mode.
 *
 * @param coordinator Active edit-mode coordinator.
 * @param editMesh Mesh that owns the vertex.
 */
function selectFirstVertex(coordinator: CoordinatorEditMode, editMesh: THREE.Mesh): void {
  coordinator
    .getSession()
    .getComponentSelection()
    .select({ targetId: editMesh.uuid, kind: 'vertex', componentKey: '0' }, false);
}
