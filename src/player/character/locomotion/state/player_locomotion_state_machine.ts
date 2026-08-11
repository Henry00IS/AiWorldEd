import { PLAYER_LOCOMOTION_GAIT } from '../player_locomotion_gait_config.js';
import type { PlayerLocomotionStateId } from './player_locomotion_state_id.js';
import type { PlayerLocomotionStateInput } from './player_locomotion_state_input.js';
import { playerLocomotionResolveState } from './player_locomotion_state_resolve.js';

/**
 * Exclusive locomotion state machine.
 *
 * Wall modes exist only while `isWallPushing` is true. The same flag gates
 * enter and exit, so walking/running and wall push never overlap and leave
 * together.
 */
export class PlayerLocomotionStateMachine {
  private activeState: PlayerLocomotionStateId;
  private lastWallLateralSign: number;

  /** Creates a machine starting in idle. */
  constructor() {
    this.activeState = 'idle';
    this.lastWallLateralSign = 1;
  }

  /**
   * Returns the exclusive active state.
   *
   * @returns Active state id.
   */
  getState(): PlayerLocomotionStateId {
    return this.activeState;
  }

  /**
   * Returns the last non-zero wall lateral travel sign (+1 left, -1 right).
   *
   * @returns Wall-left travel sign.
   */
  getWallLateralSign(): number {
    return this.lastWallLateralSign >= 0 ? 1 : -1;
  }

  /** Resets to idle for a new play session. */
  reset(): void {
    this.activeState = 'idle';
    this.lastWallLateralSign = 1;
  }

  /**
   * Advances exclusive state from body drivers.
   *
   * @param input Body and wall drivers.
   */
  update(input: PlayerLocomotionStateInput): void {
    this.rememberWallLateralSign(input);
    this.activeState = playerLocomotionResolveState(input);
  }

  /**
   * Remembers signed lateral motion for side-step direction.
   *
   * @param input Body drivers.
   */
  private rememberWallLateralSign(input: PlayerLocomotionStateInput): void {
    if (Math.abs(input.wallLateralSpeed) >= PLAYER_LOCOMOTION_GAIT.sideStepVelocitySignThreshold) {
      this.lastWallLateralSign = input.wallLateralSpeed >= 0 ? 1 : -1;
      return;
    }
    if (Math.abs(input.wallLateralIntent) > 1e-3) {
      this.lastWallLateralSign = input.wallLateralIntent >= 0 ? 1 : -1;
    }
  }
}
