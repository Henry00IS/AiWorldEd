import { afterEach, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerOrthoPan } from '@/navigation/camera/handler_ortho_pan.js';
import { managerPointerLock } from '@/input/manager_pointer_lock.js';
import { createDefaultMouseSettings } from '@/settings/store/settings_defaults.js';
import type { MouseSettings } from '@/settings/store/settings_types.js';

describe('OrthoPanHandler', () => {
  afterEach(() => {
    managerPointerLock.reset();
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      value: null,
    });
  });

  it('should set and clear pan state on right click', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    const handler = new HandlerOrthoPan(canvas, camera, zoomCallback);
    let moveHandled = 0;
    canvas.addEventListener('pointermove', () => {
      moveHandled++;
    });
    expect(handler.isNavigating()).toBe(false);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    expect(handler.isNavigating()).toBe(true);
    canvas.dispatchEvent(new PointerEvent('pointermove', { button: 0, pointerId: 1 }));
    expect(moveHandled).toBe(1);
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 2, pointerId: 1 }));
    expect(handler.isNavigating()).toBe(false);
  });

  it('should trigger zoom callback on wheel event with pointer fractions', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150 }),
    });
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    new HandlerOrthoPan(canvas, camera, zoomCallback);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 150, clientY: 100 }));
    expect(zoomCallback).toHaveBeenCalled();
    const [factor, pointerU, pointerV] = zoomCallback.mock.calls[0] as [number, number, number];
    expect(factor).toBeGreaterThan(1);
    expect(pointerU).toBeCloseTo(0.25);
    expect(pointerV).toBeCloseTo(0.5);
  });

  it('should attempt pointer lock on right button down', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    const lockSpy = vi.fn();
    (canvas as any).requestPointerLock = lockSpy;
    new HandlerOrthoPan(canvas, camera, zoomCallback);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    expect(lockSpy).toHaveBeenCalled();
  });

  it('should exit pointer lock on right button up', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    (canvas as any).requestPointerLock = () => {
      Object.defineProperty(document, 'pointerLockElement', { value: canvas, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const exitLockSpy = vi.fn(() => {
      Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    (document as any).exitPointerLock = exitLockSpy;
    new HandlerOrthoPan(canvas, camera, zoomCallback);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 2, pointerId: 1 }));
    expect(exitLockSpy).toHaveBeenCalled();
  });

  it('should stop panning when pointer lock is lost externally', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const zoomCallback = vi.fn();
    (canvas as any).requestPointerLock = () => {
      Object.defineProperty(document, 'pointerLockElement', { value: canvas, configurable: true });
    };
    new HandlerOrthoPan(canvas, camera, zoomCallback);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    const initialPosition = camera.position.clone();
    canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: 10, movementY: 0, pointerId: 1 }));
    expect(camera.position.distanceTo(initialPosition)).toBeGreaterThan(0.001);
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
    const positionAfterLockLoss = camera.position.clone();
    canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: 10, movementY: 0, pointerId: 1 }));
    expect(camera.position.distanceTo(positionAfterLockLoss)).toBeLessThan(0.001);
  });
});

/**
 * Merges mouse-setting overrides onto the documented defaults.
 *
 * @param overrides Partial mouse preferences.
 * @returns Complete mouse settings snapshot.
 */
function mouseSettings(overrides: Partial<MouseSettings> = {}): MouseSettings {
  return { ...createDefaultMouseSettings(), ...overrides };
}

/**
 * Returns camera movement after a right-mouse pan in an orthographic view.
 *
 * @param overrides Mouse setting overrides applied before the drag.
 * @param movementX Horizontal pointer delta in pixels.
 * @param movementY Vertical pointer delta in pixels.
 * @returns World-space position change.
 */
function orthoPanDelta(
  overrides: Partial<MouseSettings> = {},
  movementX: number = 10,
  movementY: number = 0,
): THREE.Vector3 {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const handler = new HandlerOrthoPan(canvas, camera, vi.fn());
  handler.applyMouseNavigationSettings(mouseSettings(overrides));
  canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
  const before = camera.position.clone();
  canvas.dispatchEvent(new PointerEvent('pointermove', { movementX, movementY, pointerId: 1 }));
  const delta = camera.position.clone().sub(before);
  handler.dispose();
  return delta;
}

describe('OrthoPanHandler mouse settings', () => {
  afterEach(() => {
    managerPointerLock.reset();
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      value: null,
    });
  });

  it('scales pan distance by pan sensitivity relative to the default of 50', () => {
    const atDefault = orthoPanDelta({ panSensitivity: 50 }, 10, 0);
    const atDouble = orthoPanDelta({ panSensitivity: 100 }, 10, 0);
    expect(atDefault.length()).toBeGreaterThan(0);
    expect(atDouble.x).toBeCloseTo(atDefault.x * 2, 5);
  });

  it('inverts pan X when panInvertXAxis is enabled', () => {
    const normal = orthoPanDelta({ panInvertXAxis: false }, 10, 0);
    const inverted = orthoPanDelta({ panInvertXAxis: true }, 10, 0);
    expect(inverted.x).toBeCloseTo(-normal.x, 5);
  });

  it('inverts pan Y when panInvertYAxis is enabled', () => {
    const normal = orthoPanDelta({ panInvertYAxis: false }, 0, 10);
    const inverted = orthoPanDelta({ panInvertYAxis: true }, 0, 10);
    expect(inverted.y).toBeCloseTo(-normal.y, 5);
  });

  it('inverts orthographic wheel zoom when invertMouseWheel is enabled', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    const handler = new HandlerOrthoPan(canvas, camera, zoomCallback);
    handler.applyMouseNavigationSettings(mouseSettings({ invertMouseWheel: false }));
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 100, clientY: 50, cancelable: true }));
    const normalFactor = zoomCallback.mock.calls[0]?.[0] as number;
    handler.applyMouseNavigationSettings(mouseSettings({ invertMouseWheel: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 100, clientY: 50, cancelable: true }));
    const invertedFactor = zoomCallback.mock.calls[1]?.[0] as number;
    handler.dispose();
    expect(normalFactor).toBeGreaterThan(1);
    expect(invertedFactor).toBeLessThan(1);
  });
});
