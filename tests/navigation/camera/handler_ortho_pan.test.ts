import { afterEach, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerOrthoPan } from '@/navigation/camera/handler_ortho_pan.js';
import { managerPointerLock } from '@/input/manager_pointer_lock.js';

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
