import * as THREE from 'three';
import type { PlayerBallViewHost } from '@/player/ball/player_ball_view.js';
import { PLAYER_KEYBOARD_KEY_COUNT, PLAYER_KEYBOARD_LOWEST_PITCH } from './player_keyboard_constants.js';
import { PlayerKeyboardHands } from './player_keyboard_hands.js';
import { PlayerKeyboardModel } from './player_keyboard_model.js';
import { PlayerKeyboardSynth } from './player_keyboard_synth.js';

/** Creates the voices of one keyboard (replaceable in tests). */
export type PlayerKeyboardSynthFactory = () => PlayerKeyboardSynth;

/**
 * One keyboard on its stand, local or remote: the model, its sounding notes,
 * the sunk keys and the hand targets. Disposing it fades its notes out and
 * frees the model and the audio nodes.
 */
export class PlayerKeyboardInstance {
  readonly model: PlayerKeyboardModel;
  readonly hands = new PlayerKeyboardHands();
  readonly synth: PlayerKeyboardSynth;
  protected readonly held = new Map<number, number>();
  private readonly keys = new Set<number>();
  private readonly center = new THREE.Vector3();

  /**
   * Builds and shows a keyboard.
   *
   * @param view Helper root access.
   * @param color Member color.
   * @param synth Voice factory.
   */
  constructor(
    private readonly view: PlayerBallViewHost,
    color: number,
    synth: PlayerKeyboardSynthFactory,
  ) {
    this.model = new PlayerKeyboardModel(color);
    this.synth = synth();
    this.synth.preload();
    view.helperAdd(this.model.root);
  }

  /**
   * Moves the keyboard.
   *
   * @param position Stand center on the ground.
   * @param yaw Playing direction.
   */
  place(position: THREE.Vector3, yaw: number): void {
    this.model.place(position, yaw);
    this.soundPlace();
  }

  /**
   * Sounds a note and sinks its key.
   *
   * @param pitch MIDI pitch of the key.
   * @param instrument Instrument slot.
   * @param now Time in milliseconds.
   * @param transpose Semitones the octave shift adds to the sounding pitch.
   */
  press(pitch: number, instrument: number, now: number, transpose = 0): void {
    this.held.set(pitch, now);
    this.synth.noteOn(pitch, instrument, undefined, transpose);
  }

  /**
   * Releases a note and raises its key.
   *
   * @param pitch MIDI pitch.
   */
  release(pitch: number): void {
    this.held.delete(pitch);
    this.synth.noteOff(pitch);
  }

  /**
   * Tells whether no note is held.
   *
   * @returns True with every key up.
   */
  isReleased(): boolean {
    return this.held.size === 0;
  }

  /**
   * Returns the sounding pitches.
   *
   * @returns Pitches.
   */
  getHeldPitches(): number[] {
    return [...this.held.keys()];
  }

  /**
   * Shows held keys, moves the hands and keeps the sound at the keyboard.
   *
   * @param seconds Elapsed seconds.
   */
  animate(seconds: number): void {
    this.keys.clear();
    this.held.forEach((_, pitch) => {
      const index = pitch - PLAYER_KEYBOARD_LOWEST_PITCH;
      if (index >= 0 && index < PLAYER_KEYBOARD_KEY_COUNT) this.keys.add(index);
    });
    this.model.setHeld(this.keys);
    this.hands.update(this.model, this.keys, seconds);
    this.soundPlace();
  }

  /**
   * Puts the sound (and its room) at the middle key, so notes come from the
   * stand.
   */
  private soundPlace(): void {
    this.synth.place(this.model.keyWorld(PLAYER_KEYBOARD_KEY_COUNT / 2, this.center));
  }

  /** Fades every note out, removes the model and frees its audio and memory. */
  dispose(): void {
    this.held.clear();
    this.synth.dispose();
    this.view.helperRemove(this.model.root);
    this.model.dispose();
  }
}
