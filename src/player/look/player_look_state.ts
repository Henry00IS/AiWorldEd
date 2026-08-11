import * as THREE from 'three';
import { PLAYER_MOUSE_SENSITIVITY, PLAYER_PITCH_LIMIT_RADIANS } from '@/player/player_constants.js';

/** Yaw and pitch look state for the play-mode camera. */
export class PlayerLookState {
  private yawRadians: number;
  private pitchRadians: number;
  private readonly scratchForward: THREE.Vector3;

  /**
   * Creates look state with optional starting angles.
   *
   * @param yawRadians Initial yaw in radians.
   * @param pitchRadians Initial pitch in radians.
   */
  constructor(yawRadians: number = 0, pitchRadians: number = 0) {
    this.yawRadians = yawRadians;
    this.pitchRadians = pitchRadians;
    this.scratchForward = new THREE.Vector3();
  }

  /**
   * Applies mouse movement deltas to yaw and pitch.
   *
   * @param movementX Pointer movement X in pixels.
   * @param movementY Pointer movement Y in pixels.
   */
  applyMouseDelta(movementX: number, movementY: number): void {
    this.yawRadians -= movementX * PLAYER_MOUSE_SENSITIVITY;
    this.pitchRadians -= movementY * PLAYER_MOUSE_SENSITIVITY;
    this.pitchRadians = Math.max(-PLAYER_PITCH_LIMIT_RADIANS, Math.min(PLAYER_PITCH_LIMIT_RADIANS, this.pitchRadians));
  }

  /**
   * Sets yaw and pitch absolutely.
   *
   * @param yawRadians Yaw in radians.
   * @param pitchRadians Pitch in radians.
   */
  setAngles(yawRadians: number, pitchRadians: number): void {
    this.yawRadians = yawRadians;
    this.pitchRadians = Math.max(-PLAYER_PITCH_LIMIT_RADIANS, Math.min(PLAYER_PITCH_LIMIT_RADIANS, pitchRadians));
  }

  /**
   * Returns the current yaw angle.
   *
   * @returns Yaw in radians.
   */
  getYawRadians(): number {
    return this.yawRadians;
  }

  /**
   * Returns the current pitch angle.
   *
   * @returns Pitch in radians.
   */
  getPitchRadians(): number {
    return this.pitchRadians;
  }

  /**
   * Writes the horizontal forward direction (no pitch) into the target.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyHorizontalForwardTo(target: THREE.Vector3): THREE.Vector3 {
    return target.set(Math.sin(this.yawRadians), 0, Math.cos(this.yawRadians)).normalize();
  }

  /**
   * Writes the horizontal right direction into the target.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyHorizontalRightTo(target: THREE.Vector3): THREE.Vector3 {
    this.copyHorizontalForwardTo(this.scratchForward);
    return target.set(-this.scratchForward.z, 0, this.scratchForward.x).normalize();
  }

  /**
   * Writes the full look forward direction including pitch into the target.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyLookForwardTo(target: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitchRadians);
    return target
      .set(Math.sin(this.yawRadians) * cosPitch, Math.sin(this.pitchRadians), Math.cos(this.yawRadians) * cosPitch)
      .normalize();
  }

  /**
   * Initializes yaw and pitch from a camera world look direction.
   *
   * @param camera Perspective camera to sample.
   */
  syncFromCamera(camera: THREE.PerspectiveCamera): void {
    camera.getWorldDirection(this.scratchForward);
    this.yawRadians = Math.atan2(this.scratchForward.x, this.scratchForward.z);
    this.pitchRadians = Math.asin(THREE.MathUtils.clamp(this.scratchForward.y, -1, 1));
    this.pitchRadians = Math.max(-PLAYER_PITCH_LIMIT_RADIANS, Math.min(PLAYER_PITCH_LIMIT_RADIANS, this.pitchRadians));
  }
}
