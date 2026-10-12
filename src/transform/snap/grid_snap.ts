import * as THREE from 'three';
import { buildDefaultPlaneFrame, type EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';

/** Default rotation snap step in degrees when snapping is enabled. */
export const DEFAULT_ROTATION_SNAP_DEGREES = 15;

/** Default scale snap step for scale factors (e.g. 0.1 = 10% increments). */
export const DEFAULT_SCALE_SNAP_INTERVAL = 0.1;

/**
 * Grid snapping state and operations for translate, rotate, and scale. Rounds
 * values to the nearest snap interval. Translation snaps in the working grid
 * plane frame (visual grid orientation), not always world XYZ.
 */
export class GridSnap {
  private snapEnabled: boolean;
  private snapInterval: number;
  private rotationSnapDegrees: number;
  private scaleSnapInterval: number;
  private readonly planeOrigin: THREE.Vector3;
  private readonly planeUAxis: THREE.Vector3;
  private readonly planeVAxis: THREE.Vector3;
  private readonly planeNormal: THREE.Vector3;
  private readonly scratchLocal: THREE.Vector3;
  private readonly scratchOffset: THREE.Vector3;
  private readonly scratchStartLocal: THREE.Vector3;
  private readonly workspaceBasisQuaternion: THREE.Quaternion;
  private keyboardAxisObjectOrientationEnabled: boolean;

  /**
   * Creates a new grid snap configuration.
   *
   * @param snapEnabled Whether snapping is initially enabled.
   * @param snapInterval The grid interval for translation snap.
   * @param rotationSnapDegrees Angle step in degrees for rotation snap.
   * @param scaleSnapInterval Step size for scale-factor snap.
   */
  constructor(
    snapEnabled: boolean,
    snapInterval: number,
    rotationSnapDegrees: number = DEFAULT_ROTATION_SNAP_DEGREES,
    scaleSnapInterval: number = DEFAULT_SCALE_SNAP_INTERVAL,
  ) {
    this.snapEnabled = snapEnabled;
    this.snapInterval = snapInterval;
    this.rotationSnapDegrees = rotationSnapDegrees;
    this.scaleSnapInterval = scaleSnapInterval;
    this.planeOrigin = new THREE.Vector3();
    this.planeUAxis = new THREE.Vector3(1, 0, 0);
    this.planeVAxis = new THREE.Vector3(0, 0, 1);
    this.planeNormal = new THREE.Vector3(0, 1, 0);
    this.scratchLocal = new THREE.Vector3();
    this.scratchOffset = new THREE.Vector3();
    this.scratchStartLocal = new THREE.Vector3();
    this.workspaceBasisQuaternion = new THREE.Quaternion();
    this.keyboardAxisObjectOrientationEnabled = false;
    this.setPlaneFrame(buildDefaultPlaneFrame());
  }

  /**
   * Sets the working grid plane used for translation snaps.
   *
   * @param frame Plane origin plus U (X), V (Z), and normal (Y) axes.
   */
  setPlaneFrame(frame: EditorPlaneFrame): void {
    this.planeOrigin.copy(frame.origin);
    this.planeUAxis.copy(frame.uAxis).normalize();
    this.planeVAxis.copy(frame.vAxis).normalize();
    this.planeNormal.copy(frame.normal).normalize();
  }

  /** Restores the default world XZ floor frame for translation snaps. */
  resetPlaneFrame(): void {
    this.setPlaneFrame(buildDefaultPlaneFrame());
  }

  /**
   * Returns a copy of the plane frame used for translation snaps.
   *
   * @returns Plane origin and axes.
   */
  getPlaneFrame(): EditorPlaneFrame {
    return {
      origin: this.planeOrigin.clone(),
      uAxis: this.planeUAxis.clone(),
      vAxis: this.planeVAxis.clone(),
      normal: this.planeNormal.clone(),
    };
  }

  /**
   * Stores the workspace grid rotation used by keyboard X/Y/Z locks.
   *
   * @param quaternion Grid orientation quaternion.
   */
  setWorkspaceBasisQuaternion(quaternion: THREE.Quaternion): void {
    this.workspaceBasisQuaternion.copy(quaternion);
  }

  /**
   * Copies the workspace grid rotation into the target.
   *
   * @param target Quaternion to fill.
   * @returns The target quaternion.
   */
  copyWorkspaceBasisQuaternionTo(target: THREE.Quaternion): THREE.Quaternion {
    return target.copy(this.workspaceBasisQuaternion);
  }

  /**
   * Sets whether keyboard X/Y/Z locks use object orientation instead of the
   * grid.
   *
   * @param enabled True when Local transform space is active.
   */
  setKeyboardAxisUsesObjectOrientation(enabled: boolean): void {
    this.keyboardAxisObjectOrientationEnabled = enabled;
  }

  /**
   * Returns whether keyboard X/Y/Z locks use object orientation.
   *
   * @returns True when Local transform space is active.
   */
  keyboardAxisUsesObjectOrientation(): boolean {
    return this.keyboardAxisObjectOrientationEnabled;
  }

  /**
   * Snaps a single scalar to the nearest grid interval.
   *
   * @param value The value to snap.
   * @returns The snapped value, or the original if snapping is disabled.
   */
  snapValue(value: number): number {
    if (!this.snapEnabled) {
      return value;
    }
    if (this.snapInterval <= 0) {
      return value;
    }
    return Math.round(value / this.snapInterval) * this.snapInterval;
  }

  /**
   * Snaps a free world-space vector (e.g. translation delta) in place using the
   * working grid axes. Origin is ignored; only direction basis is used.
   *
   * @param vector The vector to snap (modified in place).
   */
  snapVector3(vector: THREE.Vector3): void {
    if (!this.snapEnabled) {
      return;
    }
    this.worldVectorToLocal(vector, this.scratchLocal);
    this.snapLocalComponentsInPlace(this.scratchLocal);
    this.localToWorldVector(this.scratchLocal, vector);
  }

  /**
   * Snaps an absolute world position onto the working grid lattice in place.
   *
   * @param position World position to snap (modified in place).
   */
  snapWorldPosition(position: THREE.Vector3): void {
    if (!this.snapEnabled) {
      return;
    }
    this.worldPositionToLocal(position, this.scratchLocal);
    this.snapLocalComponentsInPlace(this.scratchLocal);
    this.localToWorldPosition(this.scratchLocal, position);
  }

  /**
   * Snaps only working-grid axes that changed relative to a start position.
   *
   * @param position The current world position to snap in place.
   * @param startPosition The pre-drag world position used to detect changes.
   */
  snapChangedAxes(position: THREE.Vector3, startPosition: THREE.Vector3): void {
    if (!this.snapEnabled) {
      return;
    }
    this.worldPositionToLocal(startPosition, this.scratchStartLocal);
    this.worldPositionToLocal(position, this.scratchLocal);
    this.snapChangedLocalAxes(this.scratchLocal, this.scratchStartLocal);
    this.localToWorldPosition(this.scratchLocal, position);
  }

  /**
   * Snaps a rotation angle in radians to the configured degree step.
   *
   * @param angleRadians The unsnapped rotation angle.
   * @returns The snapped angle in radians, or the original if snap is off.
   */
  snapAngleRadians(angleRadians: number): number {
    if (!this.snapEnabled) {
      return angleRadians;
    }
    if (this.rotationSnapDegrees <= 0) {
      return angleRadians;
    }
    const stepRadians = (this.rotationSnapDegrees * Math.PI) / 180;
    return Math.round(angleRadians / stepRadians) * stepRadians;
  }

  /**
   * Snaps a scale factor to the nearest scale snap interval.
   *
   * @param factor The unsnapped scale factor.
   * @returns The snapped factor, clamped to a minimum of 0.01.
   */
  snapScaleFactor(factor: number): number {
    const safeFactor = Math.max(0.01, factor);
    if (!this.snapEnabled) {
      return safeFactor;
    }
    if (this.scaleSnapInterval <= 0) {
      return safeFactor;
    }
    const snapped = Math.round(safeFactor / this.scaleSnapInterval) * this.scaleSnapInterval;
    return Math.max(0.01, snapped);
  }

  /**
   * Returns whether snapping is currently enabled.
   *
   * @returns True if snapping is enabled.
   */
  isEnabled(): boolean {
    return this.snapEnabled;
  }

  /**
   * Enables or disables all snapping modes.
   *
   * @param enabled Whether snapping should be enabled.
   */
  setEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
  }

  /**
   * Returns the current translation snap interval.
   *
   * @returns The snap interval value.
   */
  getInterval(): number {
    return this.snapInterval;
  }

  /**
   * Sets a new translation snap interval.
   *
   * @param interval The new grid interval value.
   */
  setInterval(interval: number): void {
    this.snapInterval = interval;
  }

  /**
   * Returns the rotation snap step in degrees.
   *
   * @returns Rotation snap degrees.
   */
  getRotationSnapDegrees(): number {
    return this.rotationSnapDegrees;
  }

  /**
   * Sets the rotation snap step in degrees.
   *
   * @param degrees The new rotation snap step.
   */
  setRotationSnapDegrees(degrees: number): void {
    this.rotationSnapDegrees = degrees;
  }

  /**
   * Returns the scale factor snap interval.
   *
   * @returns Scale snap interval.
   */
  getScaleSnapInterval(): number {
    return this.scaleSnapInterval;
  }

  /**
   * Sets the scale factor snap interval.
   *
   * @param interval The new scale snap step.
   */
  setScaleSnapInterval(interval: number): void {
    this.scaleSnapInterval = interval;
  }

  /**
   * Projects a free world vector into grid-local components (X=U, Y=normal,
   * Z=V).
   *
   * @param worldVector Source world vector.
   * @param targetLocal Destination local components.
   */
  private worldVectorToLocal(worldVector: THREE.Vector3, targetLocal: THREE.Vector3): void {
    targetLocal.set(
      worldVector.dot(this.planeUAxis),
      worldVector.dot(this.planeNormal),
      worldVector.dot(this.planeVAxis),
    );
  }

  /**
   * Rebuilds a free world vector from grid-local components.
   *
   * @param localComponents Local X/Y/Z along U/normal/V.
   * @param targetWorld Destination world vector (written in place).
   */
  private localToWorldVector(localComponents: THREE.Vector3, targetWorld: THREE.Vector3): void {
    targetWorld.set(0, 0, 0);
    targetWorld.addScaledVector(this.planeUAxis, localComponents.x);
    targetWorld.addScaledVector(this.planeNormal, localComponents.y);
    targetWorld.addScaledVector(this.planeVAxis, localComponents.z);
  }

  /**
   * Converts a world position into grid-local lattice coordinates.
   *
   * @param worldPosition Source world position.
   * @param targetLocal Destination local components.
   */
  private worldPositionToLocal(worldPosition: THREE.Vector3, targetLocal: THREE.Vector3): void {
    this.scratchOffset.copy(worldPosition).sub(this.planeOrigin);
    this.worldVectorToLocal(this.scratchOffset, targetLocal);
  }

  /**
   * Converts grid-local lattice coordinates into a world position.
   *
   * @param localComponents Local X/Y/Z along U/normal/V.
   * @param targetWorld Destination world position (written in place).
   */
  private localToWorldPosition(localComponents: THREE.Vector3, targetWorld: THREE.Vector3): void {
    this.localToWorldVector(localComponents, targetWorld);
    targetWorld.add(this.planeOrigin);
  }

  /**
   * Snaps each local component of a vector in place.
   *
   * @param localComponents Local components to snap.
   */
  private snapLocalComponentsInPlace(localComponents: THREE.Vector3): void {
    localComponents.x = this.snapValue(localComponents.x);
    localComponents.y = this.snapValue(localComponents.y);
    localComponents.z = this.snapValue(localComponents.z);
  }

  /**
   * Snaps only local axes that moved relative to a start local position.
   *
   * @param currentLocal Current local components (modified).
   * @param startLocal Start local components.
   */
  private snapChangedLocalAxes(currentLocal: THREE.Vector3, startLocal: THREE.Vector3): void {
    const epsilon = 1e-8;
    if (Math.abs(currentLocal.x - startLocal.x) > epsilon) {
      currentLocal.x = this.snapValue(currentLocal.x);
    }
    if (Math.abs(currentLocal.y - startLocal.y) > epsilon) {
      currentLocal.y = this.snapValue(currentLocal.y);
    }
    if (Math.abs(currentLocal.z - startLocal.z) > epsilon) {
      currentLocal.z = this.snapValue(currentLocal.z);
    }
  }
}
