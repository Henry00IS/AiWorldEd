import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { OrthoPanHandler } from '../src/managers/ortho_pan_handler.js';

describe('OrthoPanHandler', () => {
  it('should be instantiable', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    const handler = new OrthoPanHandler(canvas, camera, zoomCallback);
    expect(handler).toBeDefined();
  });

  it('should set and clear pan state on right click', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    new OrthoPanHandler(canvas, camera, zoomCallback);
    let moveHandled = 0;
    canvas.addEventListener('pointermove', () => { moveHandled++; });
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, offsetX: 0, offsetY: 0, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { button: 0, offsetX: 100, offsetY: 100, pointerId: 1 }));
    expect(moveHandled).toBe(1);
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 2, offsetX: 100, offsetY: 100, pointerId: 1 }));
  });

  it('should trigger zoom callback on wheel event', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    new OrthoPanHandler(canvas, camera, zoomCallback);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    expect(zoomCallback).toHaveBeenCalled();
  });

  it('should attempt pointer lock on right button down', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    const lockSpy = vi.fn();
    (canvas as any).requestPointerLock = lockSpy;
    new OrthoPanHandler(canvas, camera, zoomCallback);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    expect(lockSpy).toHaveBeenCalled();
  });

  it('should exit pointer lock on right button up', () => {
    const canvas = document.createElement('canvas');
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomCallback = vi.fn();
    (canvas as any).requestPointerLock = () => {
      document.pointerLockElement = canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const exitLockSpy = vi.fn(() => {
      document.pointerLockElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    (document as any).exitPointerLock = exitLockSpy;
    new OrthoPanHandler(canvas, camera, zoomCallback);
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
      document.pointerLockElement = canvas;
    };
    new OrthoPanHandler(canvas, camera, zoomCallback);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    const initialPosition = camera.position.clone();
    canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: 10, movementY: 0, pointerId: 1 }));
    expect(camera.position.distanceTo(initialPosition)).toBeGreaterThan(0.001);
    document.pointerLockElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
    const positionAfterLockLoss = camera.position.clone();
    canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: 10, movementY: 0, pointerId: 1 }));
    expect(camera.position.distanceTo(positionAfterLockLoss)).toBeLessThan(0.001);
  });
});
