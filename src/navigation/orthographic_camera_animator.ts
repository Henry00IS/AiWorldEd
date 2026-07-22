import * as THREE from 'three';
import { easeOutCubic } from '../utils/easing.js';
import { CameraAnimationConfig } from './camera_animation_config.js';
import { FrustumPlanes } from '../types/frustum_planes.js';

/**
 * Smoothly animates an orthographic camera's frustum planes
 * to a target configuration using ease-out cubic interpolation.
 */
export class OrthographicCameraAnimator {
  private camera: THREE.OrthographicCamera;
  private startLeft: number;
  private startRight: number;
  private startTop: number;
  private startBottom: number;
  private targetLeft: number;
  private targetRight: number;
  private targetTop: number;
  private targetBottom: number;
  private startTime: number;
  private duration: number;
  private animationActive: boolean;

  /**
   * Creates a new orthographic camera animator in an idle state.
   */
  constructor() {
    this.camera = null as unknown as THREE.OrthographicCamera;
    this.startLeft = 0;
    this.startRight = 0;
    this.startTop = 0;
    this.startBottom = 0;
    this.targetLeft = 0;
    this.targetRight = 0;
    this.targetTop = 0;
    this.targetBottom = 0;
    this.startTime = 0;
    this.duration = 300;
    this.animationActive = false;
  }

  /**
   * Starts a new frustum animation to smoothly adjust camera frustum planes.
   * @param camera The orthographic camera to animate.
   * @param targetFrustum The target frustum plane values.
   * @param config Configuration controlling animation timing.
   * @returns True if the animation was successfully started.
   */
  animateToFrustum(
    camera: THREE.OrthographicCamera,
    targetFrustum: FrustumPlanes,
    config: CameraAnimationConfig
  ): boolean {
    this.camera = camera;
    this.startLeft = camera.left;
    this.startRight = camera.right;
    this.startTop = camera.top;
    this.startBottom = camera.bottom;
    this.targetLeft = targetFrustum.left;
    this.targetRight = targetFrustum.right;
    this.targetTop = targetFrustum.top;
    this.targetBottom = targetFrustum.bottom;
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
   * Updates frustum planes and projection matrix if still in progress.
   * @returns True if the animation is still running, false if complete.
   */
  update(): boolean {
    if (!this.animationActive) return false;
    const now = performance.now();
    const elapsed = now - this.startTime;
    const rawT = Math.min(elapsed / this.duration, 1);
    const easedT = easeOutCubic(rawT);
    this.interpolateFrustumPlanes(easedT);
    this.camera.updateProjectionMatrix();
    if (rawT >= 1) {
      this.animationActive = false;
    }
    return this.animationActive;
  }

  /**
   * Cancels the current animation and snaps the frustum
   * to the interpolated state at the current progress.
   */
  cancel(): void {
    if (!this.animationActive) return;
    const now = performance.now();
    const elapsed = now - this.startTime;
    const rawT = Math.min(elapsed / this.duration, 1);
    const easedT = easeOutCubic(rawT);
    this.interpolateFrustumPlanes(easedT);
    this.camera.updateProjectionMatrix();
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
   * Interpolates all four frustum planes between start and target.
   * @param t The normalized interpolation parameter.
   */
  private interpolateFrustumPlanes(t: number): void {
    this.camera.left = this.lerp(this.startLeft, this.targetLeft, t);
    this.camera.right = this.lerp(this.startRight, this.targetRight, t);
    this.camera.top = this.lerp(this.startTop, this.targetTop, t);
    this.camera.bottom = this.lerp(this.startBottom, this.targetBottom, t);
  }

  /**
   * Performs linear interpolation between two numeric values.
   * @param a The start value.
   * @param b The end value.
   * @param t The interpolation parameter between 0 and 1.
   * @returns The interpolated value.
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Immediately sets the camera frustum to the target values.
   */
  private snapToTarget(): void {
    this.camera.left = this.targetLeft;
    this.camera.right = this.targetRight;
    this.camera.top = this.targetTop;
    this.camera.bottom = this.targetBottom;
    this.camera.updateProjectionMatrix();
  }
}
