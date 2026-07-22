import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { FlyingCamera } from '../src/managers/flying_camera.js';

describe('FlyingCamera', () => {
  it('should initialize with given yaw and pitch values', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    expect(flyingCamera).toBeDefined();
    expect(flyingCamera.getYaw()).toBe(0);
    expect(flyingCamera.getPitch()).toBe(0);
  });

  it('should update forward direction based on yaw and pitch', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    const forward = flyingCamera.getForwardDirection();
    expect(forward.length()).toBeCloseTo(1, 3);
  });

  it('should return normalized forward direction', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, Math.PI / 4, Math.PI / 6);
    const forward = flyingCamera.getForwardDirection();
    expect(forward.length()).toBeCloseTo(1, 3);
  });

  it('should update camera position during update cycle', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      isRightMouseDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    const initialPosition = camera.position.clone();
    flyingCamera.update(0.016);
    expect(camera.position.distanceTo(initialPosition)).toBeLessThan(0.001);
  });

  it('should not move with WASD unless right mouse fly mode is active', () => {
    const keys = new Set<string>();
    const mockInputManager = {
      isKeyDown: (code: string) => keys.has(code),
      isRightMouseDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    keys.add('KeyW');
    flyingCamera.update(0.1);
    expect(camera.position.length()).toBeLessThan(0.001);
  });

  it('should move with WASD while right mouse button fly is held', () => {
    const keys = new Set<string>();
    const mockInputManager = {
      isKeyDown: (code: string) => keys.has(code),
      isRightMouseDown: () => true,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    (canvas as any).requestPointerLock = () => {
      document.pointerLockElement = canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    keys.add('KeyW');
    const before = camera.position.clone();
    flyingCamera.update(0.1);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0.01);
  });

  it('should clamp pitch to valid range', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, Math.PI / 4);
    expect(flyingCamera.getPitch()).toBeLessThan(Math.PI / 2);
    expect(flyingCamera.getPitch()).toBeGreaterThan(-Math.PI / 2);
  });

  it('should attempt pointer lock on right button down', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const lockSpy = vi.fn();
    (canvas as any).requestPointerLock = lockSpy;
    new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    expect(lockSpy).toHaveBeenCalled();
  });

  it('should not attempt pointer lock on left button down', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const lockSpy = vi.fn();
    (canvas as any).requestPointerLock = lockSpy;
    new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1 }));
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it('should attempt pointer lock on middle button down', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const lockSpy = vi.fn();
    (canvas as any).requestPointerLock = lockSpy;
    new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1 }));
    expect(lockSpy).toHaveBeenCalled();
  });

  it('should exit pointer lock when last button is released', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    (canvas as any).requestPointerLock = () => {
      document.pointerLockElement = canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const exitLockSpy = vi.fn(() => {
      document.pointerLockElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    (document as any).exitPointerLock = exitLockSpy;
    new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 2, pointerId: 1 }));
    expect(exitLockSpy).toHaveBeenCalled();
  });

  it('should not exit pointer lock when left button is released while right held', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    (canvas as any).requestPointerLock = () => {
      document.pointerLockElement = canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const exitLockSpy = vi.fn(() => {
      document.pointerLockElement = null;
    });
    (document as any).exitPointerLock = exitLockSpy;
    new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 2 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 2 }));
    expect(exitLockSpy).not.toHaveBeenCalled();
  });

  it('should not exit pointer lock while other button is held', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    (canvas as any).requestPointerLock = () => {
      document.pointerLockElement = canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const exitLockSpy = vi.fn(() => {
      document.pointerLockElement = null;
    });
    (document as any).exitPointerLock = exitLockSpy;
    new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 2 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 2, pointerId: 2 }));
    expect(exitLockSpy).not.toHaveBeenCalled();
  });

  it('should keep pan scale constant during large movements', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    (canvas as any).requestPointerLock = () => {
      document.pointerLockElement = canvas;
    };
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);

    // Start panning with middle button
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1 }));

    // Simulate many small pan movements
    const smallStep = 5;
    const steps = 200;
    const initialPos = camera.position.clone();

    for (let i = 0; i < steps; i++) {
      canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: smallStep, movementY: 0, pointerId: 1 }));
    }

    const totalDistanceAfterSmallSteps = camera.position.distanceTo(initialPos);

    // Reset camera for comparison
    camera.position.set(0, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 1, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1 }));

    // Simulate one large movement equal to the sum of small steps
    const largeDelta = smallStep * steps;
    canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: largeDelta, movementY: 0, pointerId: 1 }));

    const totalDistanceAfterLargeStep = camera.position.distanceTo(initialPos);

    // Both should produce the same result since scale is constant
    expect(totalDistanceAfterLargeStep).toBeCloseTo(totalDistanceAfterSmallSteps, 2);
  });

  it('should stop responding to movement when pointer lock is lost externally', () => {
    const mockInputManager = {
      keyStates: new Map(),
      setupKeyboardListeners: () => {},
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    (canvas as any).requestPointerLock = () => {
      document.pointerLockElement = canvas;
    };
    const flyingCamera = new FlyingCamera(canvas, camera, mockInputManager as any, 0, 0);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: 100, movementY: 0, pointerId: 1 }));
    const yawAfterMove = flyingCamera.getYaw();
    document.pointerLockElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
    canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: 100, movementY: 0, pointerId: 1 }));
    expect(flyingCamera.getYaw()).toBe(yawAfterMove);
  });

  it('should not overwrite camera orientation while idle', () => {
    const mockInputManager = {
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(10, 5, 0);
    camera.lookAt(0, 0, 0);
    const flyingCamera = new FlyingCamera(
      canvas,
      camera,
      mockInputManager as any,
      0,
      0
    );
    const beforeQuat = camera.quaternion.clone();
    flyingCamera.update(0.016);
    expect(camera.quaternion.angleTo(beforeQuat)).toBeLessThan(1e-6);
  });

  it('should sync yaw and pitch from an external camera orientation', () => {
    const mockInputManager = {
      isKeyDown: () => false,
      reset: () => {}
    };
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    const flyingCamera = new FlyingCamera(
      canvas,
      camera,
      mockInputManager as any,
      0,
      0.5
    );
    flyingCamera.syncOrientationFromCamera();
    // Looking toward -Z from +Z maps to yaw of ±π with zero pitch.
    expect(Math.abs(flyingCamera.getYaw())).toBeCloseTo(Math.PI, 2);
    expect(flyingCamera.getPitch()).toBeCloseTo(0, 2);
  });
});
