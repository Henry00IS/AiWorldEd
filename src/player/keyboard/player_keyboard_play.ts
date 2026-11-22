import * as THREE from 'three';
import type { ManagerInput } from '@/input/manager_input.js';
import type { PlayerBallSystem } from '@/player/ball/player_ball_system.js';
import type { PlayerCharacterHandTargets } from '@/player/character/player_character_hand_targets.js';
import { playerEyePositionFromFeet } from '@/player/collision/player_capsule_collider.js';
import type { PlayerLookState } from '@/player/look/player_look_state.js';
import type { PlayerBodyState } from '@/player/movement/player_body_state.js';
import { PlayerKeyboardInput } from './player_keyboard_input.js';
import { playerKeyboardClampYaw, playerKeyboardMovedOff } from './player_keyboard_pose.js';

/**
 * The local player at its keyboard: a click puts it down in front of the player
 * (who then stays on the spot, facing it) or away again; the typing keys play
 * it, Shift adds vibrato; in first person the look stays within reach of the
 * keys. Being moved off the spot puts it away.
 */
export class PlayerKeyboardPlay {
  private readonly input = new PlayerKeyboardInput();
  private locked = false;

  /**
   * Creates the controller.
   *
   * @param balls Toy system that owns the keyboards.
   * @param body Player body (held on the spot while playing).
   */
  constructor(
    private readonly balls: PlayerBallSystem,
    private readonly body: PlayerBodyState,
  ) {}

  /**
   * Tells whether the own keyboard is placed.
   *
   * @returns True while placed.
   */
  isPlaced(): boolean {
    return this.balls.getKeyboards().getLocal() !== null;
  }

  /**
   * Places the keyboard in front of the player, or puts it away.
   *
   * @param look Look state (the keyboard faces along its yaw).
   */
  toggle(look: PlayerLookState): void {
    if (this.isPlaced()) return this.putAway();
    const eye = playerEyePositionFromFeet(this.body.getFeetPosition(), new THREE.Vector3());
    const pose = this.balls.placeKeyboard(eye, look.getYawRadians());
    if (!pose) return;
    this.input.reset();
    this.body.lockInPlace(pose.yaw);
    this.locked = true;
  }

  /** Puts the keyboard away and frees the player. */
  putAway(): void {
    this.balls.putAwayKeyboard();
    this.release();
  }

  /**
   * Plays the held typing keys (held Shift adds vibrato), keeps the
   * first-person look near the keys and puts the keyboard away when the player
   * was moved off the spot.
   *
   * @param manager Physical key state.
   * @param look Look state.
   * @param firstPerson True in first person.
   */
  update(manager: ManagerInput, look: PlayerLookState, firstPerson: boolean): void {
    const pose = this.balls.getKeyboards().getLocal()?.getPose();
    if (!pose) return this.release();
    if (playerKeyboardMovedOff(pose, this.body.getFeetPosition())) return this.putAway();
    const now = this.balls.now();
    this.input.sample(manager, (pitch, down) => this.balls.keyboardKey(pitch, down, now));
    const shift = manager.isShiftDown();
    if (shift !== this.balls.getKeyboards().getVibrato()) this.balls.keyboardVibrato(shift, now);
    if (firstPerson) look.setAngles(playerKeyboardClampYaw(look.getYawRadians(), pose.yaw), look.getPitchRadians());
  }

  /**
   * Returns the keyboard's instrument.
   *
   * @returns Slot.
   */
  instrument(): number {
    return this.balls.getKeyboards().getInstrument();
  }

  /**
   * Switches the keyboard's instrument.
   *
   * @param step +1 or -1.
   * @returns New slot, or null without a placed keyboard.
   */
  instrumentStep(step: number): number | null {
    return this.balls.keyboardInstrumentStep(step);
  }

  /**
   * Returns the keyboard's octave.
   *
   * @returns 0 for the lowest, 1 for an octave up.
   */
  octave(): number {
    return this.balls.getKeyboards().getOctave();
  }

  /**
   * Shifts the keyboard an octave up or down.
   *
   * @param step +1 or -1.
   * @returns True when the octave changed.
   */
  octaveStep(step: number): boolean {
    return this.isPlaced() && this.balls.keyboardOctaveStep(step);
  }

  /**
   * Returns the targets the own character's hands follow.
   *
   * @returns Hand targets, or null when not playing.
   */
  getHands(): PlayerCharacterHandTargets | null {
    return this.balls.getKeyboards().getLocal()?.hands ?? null;
  }

  /** Frees the player and forgets held keys once the keyboard is gone. */
  private release(): void {
    if (!this.locked) return;
    this.locked = false;
    this.input.reset();
    this.body.lockInPlace(null);
  }
}
