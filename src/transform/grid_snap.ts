import * as THREE from 'three';

/**
 * Default rotation snap step in degrees when snapping is enabled.
 */
export const DEFAULT_ROTATION_SNAP_DEGREES = 15;

/**
 * Default scale snap step for scale factors (e.g. 0.1 = 10% increments).
 */
export const DEFAULT_SCALE_SNAP_INTERVAL = 0.1;

/**
 * Grid snapping state and operations for translate, rotate, and scale.
 * Rounds values to the nearest snap interval for precise placement.
 */
export class GridSnap {
  private snapEnabled: boolean;
  private snapInterval: number;
  private rotationSnapDegrees: number;
  private scaleSnapInterval: number;

  /**
   * Creates a new grid snap configuration.
   * @param snapEnabled Whether snapping is initially enabled.
   * @param snapInterval The grid interval for translation snap.
   * @param rotationSnapDegrees Angle step in degrees for rotation snap.
   * @param scaleSnapInterval Step size for scale-factor snap.
   */
  constructor(
    snapEnabled: boolean,
    snapInterval: number,
    rotationSnapDegrees: number = DEFAULT_ROTATION_SNAP_DEGREES,
    scaleSnapInterval: number = DEFAULT_SCALE_SNAP_INTERVAL
  ) {
    this.snapEnabled = snapEnabled;
    this.snapInterval = snapInterval;
    this.rotationSnapDegrees = rotationSnapDegrees;
    this.scaleSnapInterval = scaleSnapInterval;
  }

  /**
   * Snaps a single value to the nearest grid interval.
   * @param value The value to snap.
   * @returns The snapped value, or the original if snapping is disabled.
   */
  snapValue(value: number): number {
    if (!this.snapEnabled) return value;
    if (this.snapInterval <= 0) return value;
    return Math.round(value / this.snapInterval) * this.snapInterval;
  }

  /**
   * Snaps all components of a Vector3 in place.
   * @param vector The vector to snap (modified in place).
   */
  snapVector3(vector: THREE.Vector3): void {
    if (!this.snapEnabled) return;
    vector.x = this.snapValue(vector.x);
    vector.y = this.snapValue(vector.y);
    vector.z = this.snapValue(vector.z);
  }

  /**
   * Snaps only the axes that changed relative to a start position.
   * Prevents X-axis drags from jumping Y/Z onto the grid unexpectedly.
   * @param vector The current position to snap in place.
   * @param startPosition The pre-drag position used to detect changed axes.
   */
  snapChangedAxes(vector: THREE.Vector3, startPosition: THREE.Vector3): void {
    if (!this.snapEnabled) return;
    const epsilon = 1e-8;
    if (Math.abs(vector.x - startPosition.x) > epsilon) {
      vector.x = this.snapValue(vector.x);
    }
    if (Math.abs(vector.y - startPosition.y) > epsilon) {
      vector.y = this.snapValue(vector.y);
    }
    if (Math.abs(vector.z - startPosition.z) > epsilon) {
      vector.z = this.snapValue(vector.z);
    }
  }

  /**
   * Snaps a rotation angle in radians to the configured degree step.
   * @param angleRadians The unsnapped rotation angle.
   * @returns The snapped angle in radians, or the original if snap is off.
   */
  snapAngleRadians(angleRadians: number): number {
    if (!this.snapEnabled) return angleRadians;
    if (this.rotationSnapDegrees <= 0) return angleRadians;
    const stepRadians = (this.rotationSnapDegrees * Math.PI) / 180;
    return Math.round(angleRadians / stepRadians) * stepRadians;
  }

  /**
   * Snaps a scale factor to the nearest scale snap interval.
   * @param factor The unsnapped scale factor.
   * @returns The snapped factor, clamped to a minimum of 0.01.
   */
  snapScaleFactor(factor: number): number {
    const safeFactor = Math.max(0.01, factor);
    if (!this.snapEnabled) return safeFactor;
    if (this.scaleSnapInterval <= 0) return safeFactor;
    const snapped =
      Math.round(safeFactor / this.scaleSnapInterval) * this.scaleSnapInterval;
    return Math.max(0.01, snapped);
  }

  /**
   * Returns whether snapping is currently enabled.
   * @returns True if snapping is enabled.
   */
  isEnabled(): boolean {
    return this.snapEnabled;
  }

  /**
   * Enables or disables all snapping modes.
   * @param enabled Whether snapping should be enabled.
   */
  setEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
  }

  /**
   * Returns the current translation snap interval.
   * @returns The snap interval value.
   */
  getInterval(): number {
    return this.snapInterval;
  }

  /**
   * Sets a new translation snap interval.
   * @param interval The new grid interval value.
   */
  setInterval(interval: number): void {
    this.snapInterval = interval;
  }

  /**
   * Returns the rotation snap step in degrees.
   * @returns Rotation snap degrees.
   */
  getRotationSnapDegrees(): number {
    return this.rotationSnapDegrees;
  }

  /**
   * Sets the rotation snap step in degrees.
   * @param degrees The new rotation snap step.
   */
  setRotationSnapDegrees(degrees: number): void {
    this.rotationSnapDegrees = degrees;
  }

  /**
   * Returns the scale factor snap interval.
   * @returns Scale snap interval.
   */
  getScaleSnapInterval(): number {
    return this.scaleSnapInterval;
  }

  /**
   * Sets the scale factor snap interval.
   * @param interval The new scale snap step.
   */
  setScaleSnapInterval(interval: number): void {
    this.scaleSnapInterval = interval;
  }
}
