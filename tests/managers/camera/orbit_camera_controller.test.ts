import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrbitCameraController,
  orbitCameraAroundFocus,
  type OrbitCameraPreferences,
} from '../../../src/managers/camera/orbit_camera_controller.js';

/** Builds the default orbit preferences used by gesture tests. */
function createPreferences(): OrbitCameraPreferences {
  return {
    sensitivity: 50,
    invertYAxis: false,
    binding: { button: 0, ctrl: true, shift: false, alt: true, meta: false },
  };
}

/** Dispatches a pointer-shaped mouse event with movement deltas. */
function dispatchPointer(
  target: EventTarget,
  type: string,
  options: MouseEventInit & { movementX?: number; movementY?: number },
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...options });
  Object.defineProperty(event, 'movementX', { value: options.movementX ?? 0 });
  Object.defineProperty(event, 'movementY', { value: options.movementY ?? 0 });
  Object.defineProperty(event, 'pointerId', { value: 7 });
  target.dispatchEvent(event);
}

describe('orbitCameraAroundFocus', () => {
  it('preserves radius and points the camera at an arbitrary focus after yaw', () => {
    const focus = new THREE.Vector3(8, -3, 5);
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(focus).add(new THREE.Vector3(4, 3, 7));
    const radius = camera.position.distanceTo(focus);

    orbitCameraAroundFocus(camera, focus, Math.PI / 3, 0);

    expect(camera.position.distanceTo(focus)).toBeCloseTo(radius, 10);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    expect(forward.dot(focus.clone().sub(camera.position).normalize())).toBeCloseTo(1, 10);
  });

  it('changes elevation without camera roll and clamps both poles', () => {
    const focus = new THREE.Vector3();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);

    orbitCameraAroundFocus(camera, focus, 0, Math.PI);
    expect(camera.position.y).toBeGreaterThan(9.9);
    expect(camera.up.x).toBe(0);
    expect(camera.up.y).toBe(1);
    orbitCameraAroundFocus(camera, focus, 0, -Math.PI * 2);
    expect(camera.position.y).toBeLessThan(-9.9);
  });
});

describe('OrbitCameraController', () => {
  let canvas: HTMLDivElement;
  let camera: THREE.PerspectiveCamera;
  let controller: OrbitCameraController;

  beforeEach(() => {
    canvas = document.createElement('div');
    document.body.appendChild(canvas);
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    Object.defineProperty(canvas, 'requestPointerLock', { value: vi.fn(), configurable: true });
    controller = new OrbitCameraController(canvas, camera, new THREE.Vector3(), createPreferences());
  });

  afterEach(() => {
    controller.dispose();
    canvas.remove();
  });

  it('activates only for the exact default chord and stops on button release', () => {
    dispatchPointer(canvas, 'pointerdown', { button: 0, ctrlKey: true });
    expect(controller.isNavigating()).toBe(false);

    dispatchPointer(canvas, 'pointerdown', { button: 0, ctrlKey: true, altKey: true });
    expect(controller.isNavigating()).toBe(true);
    dispatchPointer(window, 'pointerup', { button: 0, ctrlKey: true, altKey: true });
    expect(controller.isNavigating()).toBe(false);
  });

  it('uses a rebound chord and stops when a required modifier is released', () => {
    controller.setPreferences({
      sensitivity: 50,
      invertYAxis: false,
      binding: { button: 2, ctrl: false, shift: true, alt: false, meta: false },
    });
    dispatchPointer(canvas, 'pointerdown', { button: 2, shiftKey: true });
    expect(controller.isNavigating()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', shiftKey: false }));
    expect(controller.isNavigating()).toBe(false);
  });

  it('reverses vertical movement when Y inversion is enabled', () => {
    const normalCamera = camera.position.clone();
    dispatchPointer(canvas, 'pointerdown', { button: 0, ctrlKey: true, altKey: true });
    dispatchPointer(canvas, 'pointermove', { ctrlKey: true, altKey: true, movementY: 20 });
    const normalY = camera.position.y;
    dispatchPointer(window, 'pointerup', { button: 0, ctrlKey: true, altKey: true });

    camera.position.copy(normalCamera);
    controller.setPreferences({ ...createPreferences(), invertYAxis: true });
    dispatchPointer(canvas, 'pointerdown', { button: 0, ctrlKey: true, altKey: true });
    dispatchPointer(canvas, 'pointermove', { ctrlKey: true, altKey: true, movementY: 20 });
    expect(camera.position.y).toBeCloseTo(-normalY, 10);
  });

  it('consumes the initiating chord before later viewport handlers', () => {
    const laterHandler = vi.fn();
    canvas.addEventListener('pointerdown', laterHandler);
    dispatchPointer(canvas, 'pointerdown', { button: 0, ctrlKey: true, altKey: true });
    expect(laterHandler).not.toHaveBeenCalled();
  });
});
