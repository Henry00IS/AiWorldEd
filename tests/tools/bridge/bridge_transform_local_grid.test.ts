import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BridgeTransformInteraction } from '@/tools/bridge/bridge_transform_interaction.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { TransformMode } from '@/types/transform_mode.js';
import { Theme } from '@/theme.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { TransformConstraint } from '@/transform/core/transform_constraint.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CommandStack } from '@/commands/command_stack.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';
import {
  getSharedProjectedGridUniforms,
  resetSharedProjectedGridUniforms,
} from '@/materials/shader/uniform/uniform_projected_grid_shared.js';

const INTERVAL = 0.25;
const TURN = THREE.MathUtils.degToRad(30);

/** One drag scene: a turned box, its bridge and the snap state. */
interface LocalDragScene {
  mesh: THREE.Mesh;
  bridge: BridgeTransformInteraction;
  handler: HandlerTransform;
  viewport: Viewport3D;
  start: THREE.Vector3;
  gridSnap: GridSnap;
}

/**
 * In Local transform space a move snaps on the object's own turned grid and the
 * grid drawn on surfaces during the move shows that grid; Global keeps the
 * workspace grid.
 */
describe('moving in Local transform space', () => {
  afterEach(() => resetSharedProjectedGridUniforms());

  it('snaps the move along the object axes in Local space', () => {
    const scene = sceneBuild(true);
    drag(scene, 400, 300, 463, 271);
    const local = localMove(scene);
    expect(local.length()).toBeGreaterThan(INTERVAL);
    expectOnLattice(local);
  });

  it('keeps snapping on the workspace grid in Global space', () => {
    const scene = sceneBuild(false);
    drag(scene, 400, 300, 463, 271);
    const world = scene.mesh.position.clone().sub(scene.start);
    expect(world.length()).toBeGreaterThan(INTERVAL);
    expectOnLattice(world);
  });

  it('draws the surface grid in the object space during the move and restores it after', () => {
    const scene = sceneBuild(true);
    const uniforms = getSharedProjectedGridUniforms();
    const before = (uniforms['gridUAxis']!.value as THREE.Vector3).clone();
    pointer(scene, 'pointerdown', 400, 300);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 430, clientY: 290 }));
    const objectX = new THREE.Vector3(1, 0, 0).applyQuaternion(scene.mesh.quaternion);
    expect((uniforms['gridUAxis']!.value as THREE.Vector3).distanceTo(objectX)).toBeLessThan(1e-6);
    expect((uniforms['gridOrigin']!.value as THREE.Vector3).distanceTo(scene.start)).toBeLessThan(1e-6);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
    expect((uniforms['gridUAxis']!.value as THREE.Vector3).distanceTo(before)).toBeLessThan(1e-6);
  });

  it('snaps on the workspace grid again after a Local move ended', () => {
    const scene = sceneBuild(true);
    drag(scene, 400, 300, 463, 271);
    const vector = new THREE.Vector3(0.6, 0, 0.35);
    scene.gridSnap.snapVector3(vector);
    expect(vector.toArray()).toEqual([0.5, 0, 0.25]);
  });
});

/**
 * Builds a box turned about Y, selected, with a bounds gizmo and a bridge.
 *
 * @param local Whether Local transform space is active.
 * @returns Drag scene.
 */
function sceneBuild(local: boolean): LocalDragScene {
  const selection = new ManagerSelection();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  mesh.position.set(0.1, 0, 0.05);
  mesh.rotation.y = TURN;
  mesh.updateMatrixWorld(true);
  selection.selectObject(mesh);
  const gizmo = new GizmoTransform(Theme);
  gizmo.setMode(TransformMode.BOUNDS);
  gizmo.setVisible(true);
  if (local) gizmo.setOrientation(mesh.quaternion.clone());
  gizmo.updateBoundsFromMeshes([mesh]);
  const gridSnap = new GridSnap(true, INTERVAL);
  const executor = new TransformExecutor(gridSnap);
  const handler = new HandlerTransform(
    gizmo,
    new GizmoRaycaster(),
    executor,
    new TransformConstraint(),
    new CommandStack(16),
  );
  const bridge = new BridgeTransformInteraction({
    selectionManager: selection,
    selectionVisualController: { syncDuringTransform: () => undefined } as never,
    transformGizmo: gizmo,
    transformHandler: handler,
    transformExecutor: executor,
    gridSnap,
    inputManager: { isShiftDown: () => false } as never,
    propertiesPanel: { refreshBoundObject: () => undefined } as never,
    worldObject: new THREE.Group(),
    getUserSnapEnabled: () => true,
    isTransformSpaceLocal: () => local,
    onAfterTransformCommit: () => undefined,
  });
  const viewport = viewportBuild(gizmo.getHandleGroupClone());
  return { mesh, bridge, handler, viewport, start: mesh.position.clone(), gridSnap };
}

/**
 * Creates a perspective viewport stand-in looking down at the box.
 *
 * @param gizmoGroup Gizmo handle clone.
 * @returns Viewport.
 */
function viewportBuild(gizmoGroup: THREE.Group): Viewport3D {
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 8, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    width: 800,
    height: 600,
    style: { cursor: '' },
  };
  gizmoGroup.visible = true;
  gizmoGroup.updateMatrixWorld(true);
  return {
    getCamera: () => camera,
    getRenderer: () => ({ domElement: canvas }),
    getContentElement: () => canvas,
    getGizmoGroup: () => gizmoGroup,
    getViewportKind: () => ViewportKind.PERSPECTIVE,
    isCameraNavigating: () => false,
  } as unknown as Viewport3D;
}

/**
 * Sends one pointer event to the bridge.
 *
 * @param scene Drag scene.
 * @param type Event type.
 * @param x Client x.
 * @param y Client y.
 */
function pointer(scene: LocalDragScene, type: string, x: number, y: number): void {
  scene.bridge.onTransformEvent(new MouseEvent(type, { clientX: x, clientY: y }), scene.viewport);
}

/**
 * Drags the box from one point to another and releases it.
 *
 * @param scene Drag scene.
 * @param fromX Start x.
 * @param fromY Start y.
 * @param toX End x.
 * @param toY End y.
 */
function drag(scene: LocalDragScene, fromX: number, fromY: number, toX: number, toY: number): void {
  pointer(scene, 'pointerdown', fromX, fromY);
  expect(scene.handler.isDragging()).toBe(true);
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: toX, clientY: toY }));
  window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
}

/**
 * Returns the move expressed along the box's own axes.
 *
 * @param scene Drag scene.
 * @returns Move in object axes.
 */
function localMove(scene: LocalDragScene): THREE.Vector3 {
  const inverse = scene.mesh.quaternion.clone().invert();
  return scene.mesh.position.clone().sub(scene.start).applyQuaternion(inverse);
}

/**
 * Expects every component to be a whole number of snap steps.
 *
 * @param vector Move components.
 */
function expectOnLattice(vector: THREE.Vector3): void {
  for (const value of vector.toArray()) {
    const steps = value / INTERVAL;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
  }
}
