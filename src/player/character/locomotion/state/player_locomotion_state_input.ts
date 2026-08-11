/** Drivers used to resolve the exclusive locomotion state. */
export interface PlayerLocomotionStateInput {
  planarSpeed: number;
  isGrounded: boolean;
  /**
   * True while the body reports wall-push (into-wall intent + contact + hand
   * height). This is the single wall-mode gate for enter and exit.
   */
  isWallPushing: boolean;
  wantsRun: boolean;
  verticalVelocity: number;
  /** Signed lateral speed along wall-left (m/s). */
  wallLateralSpeed: number;
  /** Signed desired move along wall-left (intent · wallLeft). */
  wallLateralIntent: number;
}
