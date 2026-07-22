import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { OrthographicCameraAnimator } from '../../src/navigation/orthographic_camera_animator.js';
import { CameraAnimationConfig } from '../../src/navigation/camera_animation_config.js';
import { FrustumPlanes } from '../../src/types/frustum_planes.js';

describe('OrthographicCameraAnimator', () => {
  let animator: OrthographicCameraAnimator;
  let config: CameraAnimationConfig;
  let camera: THREE.OrthographicCamera;
  let mockTime: number;

  beforeEach(() => {
    mockTime = 0;
    vi.stubGlobal('performance', {
      now: () => mockTime
    });
    animator = new OrthographicCameraAnimator();
    config = new CameraAnimationConfig();
    config.setDurationMs(100);
    camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should start in idle state', () => {
    expect(animator.isAnimating()).toBe(false);
  });

  it('should start animation when animateToFrustum is called', () => {
    config.setAnimationEnabled(true);
    const targetFrustum = createFrustum(-10, 10, 10, -10);
    const result = animator.animateToFrustum(camera, targetFrustum, config);
    expect(result).toBe(true);
    expect(animator.isAnimating()).toBe(true);
  });

  it('should complete animation on update calls', () => {
    config.setAnimationEnabled(true);
    const targetFrustum = createFrustum(-10, 10, 10, -10);
    animator.animateToFrustum(camera, targetFrustum, config);
    mockTime += 200;
    const stillRunning = animator.update();
    expect(stillRunning).toBe(false);
    expect(animator.isAnimating()).toBe(false);
  });

  it('should snap instantly when animation is disabled', () => {
    config.setAnimationEnabled(false);
    const targetFrustum = createFrustum(-20, 20, 20, -20);
    const result = animator.animateToFrustum(camera, targetFrustum, config);
    expect(result).toBe(false);
    expect(animator.isAnimating()).toBe(false);
    expect(camera.left).toBeCloseTo(-20);
    expect(camera.right).toBeCloseTo(20);
    expect(camera.top).toBeCloseTo(20);
    expect(camera.bottom).toBeCloseTo(-20);
  });

  it('should interpolate frustum planes toward target during animation', () => {
    config.setAnimationEnabled(true);
    const startLeft = camera.left;
    const targetFrustum = createFrustum(-20, 20, 20, -20);
    animator.animateToFrustum(camera, targetFrustum, config);
    mockTime += 50;
    animator.update();
    const moved = Math.abs(camera.left - startLeft) > 0.001;
    expect(moved).toBe(true);
  });

  it('should call updateProjectionMatrix during animation', () => {
    config.setAnimationEnabled(true);
    const targetFrustum = createFrustum(-10, 10, 10, -10);
    const originalUpdate = camera.updateProjectionMatrix.bind(camera);
    let callCount = 0;
    camera.updateProjectionMatrix = () => {
      callCount++;
      originalUpdate();
    };
    animator.animateToFrustum(camera, targetFrustum, config);
    mockTime += 50;
    animator.update();
    expect(callCount).toBeGreaterThan(0);
  });

  it('should cancel animation and snap to interpolated state', () => {
    config.setAnimationEnabled(true);
    const targetFrustum = createFrustum(-20, 20, 20, -20);
    animator.animateToFrustum(camera, targetFrustum, config);
    mockTime += 50;
    animator.cancel();
    expect(animator.isAnimating()).toBe(false);
  });

  it('should return false on update when not animating', () => {
    const result = animator.update();
    expect(result).toBe(false);
  });

  it('should reach target frustum after full animation duration', () => {
    config.setAnimationEnabled(true);
    const targetFrustum = createFrustum(-15, 15, 15, -15);
    animator.animateToFrustum(camera, targetFrustum, config);
    mockTime += 200;
    animator.update();
    expect(camera.left).toBeCloseTo(-15, 1);
    expect(camera.right).toBeCloseTo(15, 1);
    expect(camera.top).toBeCloseTo(15, 1);
    expect(camera.bottom).toBeCloseTo(-15, 1);
  });

  it('should not throw on update after animation completes', () => {
    config.setAnimationEnabled(true);
    const targetFrustum = createFrustum(-10, 10, 10, -10);
    animator.animateToFrustum(camera, targetFrustum, config);
    mockTime += 200;
    animator.update();
    expect(() => animator.update()).not.toThrow();
  });
});

function createFrustum(left: number, right: number, top: number, bottom: number): FrustumPlanes {
  return { left, right, top, bottom };
}
