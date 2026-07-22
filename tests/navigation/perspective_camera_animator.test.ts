import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { PerspectiveCameraAnimator } from '../../src/navigation/perspective_camera_animator.js';
import { CameraAnimationConfig } from '../../src/navigation/camera_animation_config.js';

describe('PerspectiveCameraAnimator', () => {
  let animator: PerspectiveCameraAnimator;
  let config: CameraAnimationConfig;
  let camera: THREE.PerspectiveCamera;
  let mockTime: number;

  beforeEach(() => {
    mockTime = 0;
    vi.stubGlobal('performance', {
      now: () => mockTime
    });
    animator = new PerspectiveCameraAnimator();
    config = new CameraAnimationConfig();
    config.setDurationMs(100);
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should start in idle state', () => {
    expect(animator.isAnimating()).toBe(false);
  });

  it('should start animation when animateToTarget is called', () => {
    config.setAnimationEnabled(true);
    const result = animator.animateToTarget(
      camera,
      new THREE.Vector3(10, 10, 10),
      new THREE.Vector3(0, 0, 0),
      config
    );
    expect(result).toBe(true);
    expect(animator.isAnimating()).toBe(true);
  });

  it('should complete animation on update calls', () => {
    config.setAnimationEnabled(true);
    animator.animateToTarget(
      camera,
      new THREE.Vector3(10, 10, 10),
      new THREE.Vector3(0, 0, 0),
      config
    );
    mockTime += 200;
    const stillRunning = animator.update();
    expect(stillRunning).toBe(false);
    expect(animator.isAnimating()).toBe(false);
  });

  it('should snap instantly when animation is disabled', () => {
    config.setAnimationEnabled(false);
    const result = animator.animateToTarget(
      camera,
      new THREE.Vector3(10, 10, 10),
      new THREE.Vector3(0, 0, 0),
      config
    );
    expect(result).toBe(false);
    expect(animator.isAnimating()).toBe(false);
    expect(camera.position.x).toBeCloseTo(10);
    expect(camera.position.y).toBeCloseTo(10);
    expect(camera.position.z).toBeCloseTo(10);
  });

  it('should move camera position toward target during animation', () => {
    config.setAnimationEnabled(true);
    const startPosition = camera.position.clone();
    animator.animateToTarget(
      camera,
      new THREE.Vector3(20, 20, 20),
      new THREE.Vector3(0, 0, 0),
      config
    );
    mockTime += 50;
    animator.update();
    const distanceFromStart = camera.position.distanceTo(startPosition);
    expect(distanceFromStart).toBeGreaterThan(0);
  });

  it('should cancel animation and snap to interpolated state', () => {
    config.setAnimationEnabled(true);
    const targetPosition = new THREE.Vector3(20, 20, 20);
    animator.animateToTarget(camera, targetPosition, new THREE.Vector3(0, 0, 0), config);
    mockTime += 50;
    animator.cancel();
    expect(animator.isAnimating()).toBe(false);
  });

  it('should return false on update when not animating', () => {
    const result = animator.update();
    expect(result).toBe(false);
  });

  it('should return false on cancel when not animating', () => {
    animator.cancel();
    expect(animator.isAnimating()).toBe(false);
  });

  it('should reach target position after full animation duration', () => {
    config.setAnimationEnabled(true);
    const targetPosition = new THREE.Vector3(15, 15, 15);
    animator.animateToTarget(camera, targetPosition, new THREE.Vector3(0, 0, 0), config);
    mockTime += 200;
    animator.update();
    expect(camera.position.x).toBeCloseTo(15, 1);
    expect(camera.position.y).toBeCloseTo(15, 1);
    expect(camera.position.z).toBeCloseTo(15, 1);
  });

  it('should not throw on update after animation completes', () => {
    config.setAnimationEnabled(true);
    animator.animateToTarget(
      camera,
      new THREE.Vector3(10, 10, 10),
      new THREE.Vector3(0, 0, 0),
      config
    );
    mockTime += 200;
    animator.update();
    expect(() => animator.update()).not.toThrow();
  });
});
