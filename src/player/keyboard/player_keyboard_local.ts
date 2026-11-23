import type * as THREE from 'three';
import {
  PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST,
  PLAYER_KEYBOARD_OCTAVE_EVENT_DOWN,
  PLAYER_KEYBOARD_OCTAVE_EVENT_UP,
  PLAYER_KEYBOARD_OCTAVE_SEMITONES,
  PLAYER_KEYBOARD_VIBRATO_EVENT_OFF,
  PLAYER_KEYBOARD_VIBRATO_EVENT_ON,
} from './player_keyboard_constants.js';
import { PlayerKeyboardInstance } from './player_keyboard_instance.js';
import { playerKeyboardInstrumentStep } from './player_keyboard_instruments.js';
import type { PlayerKeyboardPose } from './player_keyboard_pose.js';
import { playerKeyboardEntriesEncode } from './player_keyboard_entries.js';
import { PlayerKeyboardSender, type PlayerKeyboardWindow } from './player_keyboard_sender.js';
import type { ToyEntry } from '@/collaboration/shared/toy_frame.js';

/** The player's own keyboard: heard at once, and streamed to the others. */
export class PlayerKeyboardLocal extends PlayerKeyboardInstance {
  private pose: PlayerKeyboardPose | null = null;
  private pending: PlayerKeyboardWindow | null = null;

  /**
   * Places the keyboard.
   *
   * @param pose Placement and the playing spot.
   */
  setPose(pose: PlayerKeyboardPose): void {
    this.pose = pose;
    this.place(pose.position, pose.yaw);
  }

  /**
   * Returns the placement.
   *
   * @returns Pose, or null before placing.
   */
  getPose(): PlayerKeyboardPose | null {
    return this.pose;
  }

  /**
   * Plays or releases a key and queues the event.
   *
   * @param sender Outgoing stream.
   * @param pitch MIDI pitch.
   * @param down Pressed or released.
   * @param now Time in milliseconds.
   */
  key(sender: PlayerKeyboardSender, pitch: number, down: boolean, now: number): void {
    if (down === this.held.has(pitch)) return;
    const transpose = sender.getOctave() ? PLAYER_KEYBOARD_OCTAVE_SEMITONES : 0;
    if (down) this.press(pitch, sender.getInstrument(), now, transpose);
    else this.release(pitch);
    sender.record(pitch, down, now);
  }

  /**
   * Switches to the next playable instrument slot (empty sample slots are
   * skipped).
   *
   * @param sender Outgoing stream.
   * @param step +1 or -1.
   * @param now Time in milliseconds.
   * @returns New slot.
   */
  instrumentStep(sender: PlayerKeyboardSender, step: number, now: number): number {
    const slot = playerKeyboardInstrumentStep(sender.getInstrument(), step);
    this.instrumentSet(sender, slot, now);
    return slot;
  }

  /**
   * Switches to an instrument slot, streaming the switch when it changes.
   *
   * @param sender Outgoing stream.
   * @param slot Slot.
   * @param now Time in milliseconds.
   */
  instrumentSet(sender: PlayerKeyboardSender, slot: number, now: number): void {
    if (slot !== sender.getInstrument()) sender.record(PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST + slot, true, now);
  }

  /**
   * Shifts the keys up an octave or back down, streaming the shift when it
   * changes (held notes keep the octave they started in).
   *
   * @param sender Outgoing stream.
   * @param up True for the upper octave.
   * @param now Time in milliseconds.
   * @returns True when the octave changed.
   */
  octaveSet(sender: PlayerKeyboardSender, up: boolean, now: number): boolean {
    if (up === sender.getOctave()) return false;
    sender.record(up ? PLAYER_KEYBOARD_OCTAVE_EVENT_UP : PLAYER_KEYBOARD_OCTAVE_EVENT_DOWN, true, now);
    return true;
  }

  /**
   * Eases the vibrato in or out at once and streams the toggle when it changes.
   *
   * @param sender Outgoing stream.
   * @param on New state.
   * @param now Time in milliseconds.
   */
  vibratoSet(sender: PlayerKeyboardSender, on: boolean, now: number): void {
    if (on === sender.getVibrato()) return;
    this.synth.vibratoSet(on);
    sender.record(on ? PLAYER_KEYBOARD_VIBRATO_EVENT_ON : PLAYER_KEYBOARD_VIBRATO_EVENT_OFF, true, now);
  }

  /**
   * Builds the entries for an outgoing frame, flagged all released while no key
   * is held. Only a window exceeding one entry uses the second id, always with
   * the same keyboard toy type.
   *
   * @param sender Outgoing stream.
   * @param now Frame time in milliseconds.
   * @param extraId Free id for a continuation entry (null without room).
   * @returns Toy entries, or none before placing.
   */
  entries(sender: PlayerKeyboardSender, now: number, extraId: number | null): ToyEntry[] {
    if (!this.pose) return [];
    this.pending = sender.window(now, extraId === null ? 1 : 2, this.isReleased());
    const { position, yaw } = this.pose;
    const packet = { position: position.toArray() as [number, number, number], yaw, ...this.pending };
    return playerKeyboardEntriesEncode(packet, now, extraId);
  }

  /**
   * Marks the last built entry as gone out.
   *
   * @param sender Outgoing stream.
   */
  sent(sender: PlayerKeyboardSender): void {
    if (this.pending) sender.sent(this.pending);
    this.pending = null;
  }

  /**
   * Returns the feet position the player plays from.
   *
   * @returns Feet, or null before placing.
   */
  getFeet(): THREE.Vector3 | null {
    return this.pose?.feet ?? null;
  }
}
