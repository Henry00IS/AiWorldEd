import type * as THREE from 'three';

/**
 * Motion a locomotion system reads each frame: the local player's body state,
 * or a remote collaborator's body rebuilt from the presence stream.
 */
export interface PlayerLocomotionBody {
  /**
   * Returns the horizontal speed.
   *
   * @returns Meters per second.
   */
  getPlanarSpeed(): number;
  /**
   * Returns whether the body stands on the ground.
   *
   * @returns Grounded state.
   */
  getIsGrounded(): boolean;
  /**
   * Returns whether the body asks to run.
   *
   * @returns Run request.
   */
  getWantsRun(): boolean;
  /**
   * Returns the vertical velocity.
   *
   * @returns Meters per second, positive upward.
   */
  getVerticalVelocity(): number;
  /**
   * Returns whether the body pushes against a wall.
   *
   * @returns Wall push state.
   */
  getIsWallPushing(): boolean;
  /**
   * Writes the outward wall normal (zero without a wall).
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyWallNormalTo(target: THREE.Vector3): THREE.Vector3;
  /**
   * Writes the horizontal move intent.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyMoveIntentTo(target: THREE.Vector3): THREE.Vector3;
  /**
   * Writes the horizontal velocity.
   *
   * @param target Destination vector.
   * @returns The target vector.
   */
  copyHorizontalVelocityTo(target: THREE.Vector3): THREE.Vector3;
}

/** Receives a planted foot: world position and the planar speed at the plant. */
export type PlayerLocomotionFootstepSink = (x: number, y: number, z: number, planarSpeed: number) => void;
