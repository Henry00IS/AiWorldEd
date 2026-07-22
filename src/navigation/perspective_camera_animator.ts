import * as THREE from 'three';
import { easeOutCubic } from '../utils/easing.js';
import { CameraAnimationConfig } from './camera_animation_config.js';

/**
 * Smoothly animates a perspective camera from its current position
 * to a target position and look-at point using ease-out cubic interpolation.
 */
export class PerspectiveCameraAnimator {
  private camera: THREE.PerspectiveCamera;
  private startPosition: THREE.Vector3;
  private startLookAt: THREE.Vector3;
  private targetPosition: THREE.Vector3;
  private targetLookAt: THREE.Vector3;
  private startTime: number;
  private duration: number;
  private animationActive: boolean;

  /**
   * Creates a new perspective camera animator in an idle state.
   */
  constructor() {
    this.camera = null as unknown as THREE.PerspectiveCamera;
    this.startPosition = new THREE.Vector3();
    this.startLookAt = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.startTime = 0;
    this.duration = 300;
    this.animationActive = false;
  }

  /**
   * Starts a new animation to smoothly move the camera to the target state.
   * @param camera The perspective camera to animate.
   * @param targetPosition The destination camera position.
   * @param targetLookAt The destination look-at point.
   * @param config Configuration controlling animation timing.
   * @returns True if the animation was successfully started.
   */
  animateToTarget(
    camera: THREE.PerspectiveCamera,
    targetPosition: THREE.Vector3,
    targetLookAt: THREE.Vector3,
    config: CameraAnimationConfig
  ): boolean {
    this.camera = camera;
    this.startPosition.copy(camera.position);
    this.startLookAt = this.extractLookAt(camera);
    this.targetPosition.copy(targetPosition);
    this.targetLookAt.copy(targetLookAt);
    this.startTime = performance.now();
    this.duration = config.getDurationMs();

    if (!config.isAnimationEnabled()) {
      this.snapToTarget();
      return false;
    }

    this.animationActive = true;
    return true;
  }

  /**
   * Advances the animation by one frame using the current time.
   * Updates camera position and orientation if still in progress.
   * @returns True if the animation is still running, false if complete.
   */
  update(): boolean {
    if (!this.animationActive) return false;
    const now = performance.now();
    const elapsed = now - this.startTime;
    const rawT = Math.min(elapsed / this.duration, 1);
    const easedT = easeOutCubic(rawT);
    this.interpolateCameraPosition(easedT);
    this.interpolateCameraLookAt(easedT);
    if (rawT >= 1) {
      this.animationActive = false;
    }
    return this.animationActive;
  }

  /**
   * Cancels the current animation and snaps the camera
   * to the interpolated state at the current progress.
   */
  cancel(): void {
    if (!this.animationActive) return;
    const now = performance.now();
    const elapsed = now - this.startTime;
    const rawT = Math.min(elapsed / this.duration, 1);
    const easedT = easeOutCubic(rawT);
    this.interpolateCameraPosition(easedT);
    this.interpolateCameraLookAt(easedT);
    this.animationActive = false;
  }

  /**
   * Checks whether an animation is currently in progress.
   * @returns True if the animator is actively animating.
   */
  isAnimating(): boolean {
    return this.animationActive;
  }

  /**
   * Interpolates the camera position between start and target.
   * @param t The normalized interpolation parameter.
   */
  private interpolateCameraPosition(t: number): void {
    this.camera.position.lerpVectors(this.startPosition, this.targetPosition, t);
  }

  /**
   * Interpolates the camera look-at direction using spherical interpolation.
   * @param t The normalized interpolation parameter.
   */
  private interpolateCameraLookAt(t: number): void {
    const interpolatedLookAt = new THREE.Vector3();
    interpolatedLookAt.lerpVectors(this.startLookAt, this.targetLookAt, t);
    this.camera.lookAt(interpolatedLookAt);
  }

  /**
   * Immediately sets the camera to the target position and look-at.
   */
  private snapToTarget(): void {
    this.camera.position.copy(this.targetPosition);
    this.camera.lookAt(this.targetLookAt);
  }

  /**
   * Extracts a look-at point one unit along the camera's forward direction.
   * @param camera The perspective camera.
   * @returns A point in front of the camera used for orientation blending.
   */
  private extractLookAt(camera: THREE.PerspectiveCamera): THREE.Vector3 {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    return camera.position.clone().add(forward);
  }
}
