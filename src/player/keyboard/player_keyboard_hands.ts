import * as THREE from 'three';
import type { PlayerCharacterHandTargets } from '@/player/character/player_character_hand_targets.js';
import { PLAYER_KEYBOARD_KEY_COUNT } from './player_keyboard_constants.js';
import type { PlayerKeyboardModel } from './player_keyboard_model.js';

/** Rate per second at which the wrists follow the pressed keys. */
const PLAYER_KEYBOARD_HANDS_FOLLOW_PER_SECOND = 18;
/** Wrist distance behind the pressed point (toward the player). */
const PLAYER_KEYBOARD_WRIST_BACK_METERS = 0.075;
/** Wrist height above the key tops. */
const PLAYER_KEYBOARD_WRIST_LIFT_METERS = 0.04;

/**
 * Moves each wrist to the average pressed key of its half of the keyboard;
 * released, a wrist lifts and hovers over the keys it last played (it starts
 * over the middle of its half).
 */
export class PlayerKeyboardHands implements PlayerCharacterHandTargets {
  readonly left = new THREE.Vector3();
  readonly right = new THREE.Vector3();
  private placed = false;
  private leftHover = [Math.floor(PLAYER_KEYBOARD_KEY_COUNT / 4)];
  private rightHover = [Math.floor((PLAYER_KEYBOARD_KEY_COUNT * 3) / 4)];
  private readonly scratch = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  /**
   * Advances both wrists.
   *
   * @param model Placed keyboard model.
   * @param held Held key indices.
   * @param seconds Elapsed seconds.
   */
  update(model: PlayerKeyboardModel, held: ReadonlySet<number>, seconds: number): void {
    const half = PLAYER_KEYBOARD_KEY_COUNT / 2;
    const weight = this.placed ? 1 - Math.exp(-PLAYER_KEYBOARD_HANDS_FOLLOW_PER_SECOND * seconds) : 1;
    this.leftHover = this.pressedIn(held, 0, half) ?? this.leftHover;
    this.rightHover = this.pressedIn(held, half, PLAYER_KEYBOARD_KEY_COUNT) ?? this.rightHover;
    this.follow(this.left, this.target(model, this.leftHover, held.has(this.leftHover[0] ?? -1)), weight);
    this.follow(this.right, this.target(model, this.rightHover, held.has(this.rightHover[0] ?? -1)), weight);
    this.placed = true;
  }

  /** @inheritdoc */
  copyHandTargetsTo(left: THREE.Vector3, right: THREE.Vector3): boolean {
    left.copy(this.left);
    right.copy(this.right);
    return this.placed;
  }

  /**
   * Returns the held keys of one half.
   *
   * @param held Held key indices.
   * @param from First key of the half.
   * @param to Key after the half.
   * @returns Pressed keys, or null when none is.
   */
  private pressedIn(held: ReadonlySet<number>, from: number, to: number): number[] | null {
    const pressed = [...held].filter((index) => index >= from && index < to);
    return pressed.length > 0 ? pressed : null;
  }

  /**
   * Returns a wrist target over the average of its keys, down while they are
   * pressed and lifted while hovering.
   *
   * @param model Keyboard model.
   * @param keys The keys the wrist plays or last played.
   * @param pressing True while they are pressed.
   * @returns Scratch world target.
   */
  private target(model: PlayerKeyboardModel, keys: readonly number[], pressing: boolean): THREE.Vector3 {
    this.scratch.set(0, 0, 0);
    keys.forEach((index) => this.scratch.add(model.keyWorld(index, this.offset)));
    this.scratch.divideScalar(keys.length);
    this.offset.set(0, PLAYER_KEYBOARD_WRIST_LIFT_METERS - (pressing ? 0.01 : 0), -PLAYER_KEYBOARD_WRIST_BACK_METERS);
    return this.scratch.add(this.offset.applyQuaternion(model.root.quaternion));
  }

  /**
   * Eases a wrist toward its target.
   *
   * @param wrist Wrist position.
   * @param target Target.
   * @param weight Blend weight.
   */
  private follow(wrist: THREE.Vector3, target: THREE.Vector3, weight: number): void {
    wrist.lerp(target, weight);
  }
}
