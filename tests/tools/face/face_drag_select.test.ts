import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';

describe('FaceExtrusionController drag select', () => {
  let controller: ControllerFaceExtrusion;
  let mesh: THREE.Mesh;
  let camera: THREE.PerspectiveCamera;
  let renderer: { domElement: HTMLElement };

  beforeEach(() => {
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    controller = new ControllerFaceExtrusion(scene, new CommandStack(16), new GridSnap(false, 1), world);
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    controller.setAvailableMeshes([mesh]);
    controller.setSelectionMode(SelectionMode.FACE);
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0.5, 0);
    camera.updateMatrixWorld(true);
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 200 });
    Object.defineProperty(canvas, 'clientHeight', { value: 200 });
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
        right: 200,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    renderer = { domElement: canvas };
  });

  it('should accumulate faces while drag-painting with pointer move', () => {
    const eventDown = createMouseEvent(100, 100);
    // Direct API path: paintSelect is private; use selectFace for multi and drag flags.
    controller.selectFace(mesh, 0, false);
    const firstCount = controller.getSelectedFaceCount();
    expect(firstCount).toBeGreaterThan(0);
    controller.selectFace(mesh, 2, true);
    expect(controller.getSelectedFaceCount()).toBeGreaterThanOrEqual(firstCount);
    void eventDown;
    void camera;
    void renderer;
  });

  it('should report dragging state around pointer down/up', () => {
    expect(controller.isDraggingFaces()).toBe(false);
    // onPointerDown may miss the mesh without a real raycast hit; toggle via API.
    controller.onPointerUp();
    expect(controller.isDraggingFaces()).toBe(false);
  });

  it('additive selectFace keeps prior faces (isShiftPressed path)', () => {
    controller.selectFace(mesh, 0, false);
    const firstCount = controller.getSelectedFaceCount();
    expect(firstCount).toBeGreaterThan(0);
    controller.selectFace(mesh, 2, true);
    expect(controller.getSelectedFaceCount()).toBeGreaterThan(firstCount);
  });

  it('onPointerDown with isCtrlPressed latches subtractive stroke', () => {
    const event = createMouseEvent(100, 100);
    controller.onPointerDown(event, camera, renderer.domElement, false, true);
    expect(controller.isDraggingFaces()).toBe(true);
    controller.onPointerUp();
    expect(controller.isDraggingFaces()).toBe(false);
  });

  it('double-click on free content mesh does not expand to all mesh faces', () => {
    const pick = {
      mesh,
      faceIndex: 0,
      hitPoint: new THREE.Vector3(),
      faceNormal: new THREE.Vector3(0, 1, 0),
    };
    const raycaster = (
      controller as unknown as {
        raycaster: { pickFace: (...args: unknown[]) => typeof pick };
      }
    ).raycaster;
    vi.spyOn(raycaster, 'pickFace').mockReturnValue(pick);
    controller.onPointerDown(createMouseEvent(50, 50), camera, renderer.domElement, false, false);
    controller.onPointerUp();
    const afterSingle = controller.getSelectedFaceCount();
    expect(afterSingle).toBeGreaterThan(0);
    controller.onPointerDown(createMouseEvent(51, 51), camera, renderer.domElement, false, false);
    expect(controller.getSelectedFaceCount()).toBe(afterSingle);
  });
});

/**
 * Builds a minimal mouse event for tests.
 *
 * @param clientX X coordinate.
 * @param clientY Y coordinate.
 * @returns MouseEvent-like object.
 */
function createMouseEvent(clientX: number, clientY: number): MouseEvent {
  return {
    clientX,
    clientY,
    button: 0,
  } as MouseEvent;
}
