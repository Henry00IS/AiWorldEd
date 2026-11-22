import type { PlayerBallSnapshot } from '@/player/ball/player_ball_link.js';
import type { PlayerBallViewHost } from '@/player/ball/player_ball_view.js';
import type { PlayerCharacterHandTargets } from '@/player/character/player_character_hand_targets.js';
import { PLAYER_TOY_KEYBOARD } from '@/player/toy/player_toy_kind.js';
import { PlayerKeyboardInstance, type PlayerKeyboardSynthFactory } from './player_keyboard_instance.js';
import { PlayerKeyboardLocal } from './player_keyboard_local.js';
import type { PlayerKeyboardPose } from './player_keyboard_pose.js';
import { playerKeyboardEntriesDecode } from './player_keyboard_entries.js';
import { PlayerKeyboardRemote } from './player_keyboard_remote.js';
import { PlayerKeyboardSender } from './player_keyboard_sender.js';
import { playerKeyboardSettings, type PlayerKeyboardSettings } from './player_keyboard_settings.js';
import { PlayerKeyboardSynth } from './player_keyboard_synth.js';

/** Dependencies of the keyboard system. */
export interface PlayerKeyboardSystemOptions {
  view: PlayerBallViewHost;
  /**
   * Tells the room which hand targets a member's character follows (null: free
   * hands).
   */
  hands?: (member: number, hands: PlayerCharacterHandTargets | null) => void;
  synth?: PlayerKeyboardSynthFactory;
  /** Remembered instrument (the shared editor preference by default). */
  settings?: PlayerKeyboardSettings;
}

/**
 * Keyboard toys: the own placed keyboard (heard at once, its events streamed in
 * the toy frames) and the other members' keyboards (played back from those
 * events). A member's keyboard exists while its frames say it holds one; when
 * that ends, or the member leaves play mode or the room, its notes fade out and
 * its model and audio are freed.
 */
export class PlayerKeyboardSystem {
  private readonly sender = new PlayerKeyboardSender();
  private readonly remotes = new Map<number, PlayerKeyboardRemote>();
  private local: PlayerKeyboardLocal | null = null;
  private lastUpdate: number | null = null;
  private readonly synth: PlayerKeyboardSynthFactory;
  private readonly settings: PlayerKeyboardSettings;

  /**
   * Creates an empty system.
   *
   * @param options Dependencies.
   */
  constructor(private readonly options: PlayerKeyboardSystemOptions) {
    this.synth = options.synth ?? (() => new PlayerKeyboardSynth());
    this.settings = options.settings ?? playerKeyboardSettings;
  }

  /**
   * Places the own keyboard (replacing a placed one) on the remembered
   * instrument, in the lowest octave, with the vibrato off until Shift is
   * held.
   *
   * @param pose Placement and playing spot.
   * @param color Member color.
   * @param now Time in milliseconds.
   */
  place(pose: PlayerKeyboardPose, color: number, now: number): void {
    this.local?.dispose();
    this.local = new PlayerKeyboardLocal(this.options.view, color, this.synth);
    this.local.instrumentSet(this.sender, this.settings.getInstrument(), now);
    this.local.vibratoSet(this.sender, false, now);
    this.local.octaveSet(this.sender, false, now);
    this.local.setPose(pose);
    this.local.animate(0);
  }

  /** Puts the own keyboard away: its notes fade out and nothing more is sent. */
  putAway(): void {
    this.local?.dispose();
    this.local = null;
    this.sender.clear();
  }

  /**
   * Returns the own placed keyboard.
   *
   * @returns Keyboard, or null.
   */
  getLocal(): PlayerKeyboardLocal | null {
    return this.local;
  }

  /**
   * Returns another member's keyboard.
   *
   * @param member Member id.
   * @returns Keyboard, or undefined.
   */
  getRemote(member: number): PlayerKeyboardRemote | undefined {
    return this.remotes.get(member);
  }

  /**
   * Plays or releases a key of the own keyboard.
   *
   * @param pitch MIDI pitch.
   * @param down Pressed or released.
   * @param now Time in milliseconds.
   */
  key(pitch: number, down: boolean, now: number): void {
    this.local?.key(this.sender, pitch, down, now);
    this.local?.animate(0);
  }

  /**
   * Switches the own keyboard's instrument and remembers it.
   *
   * @param step +1 or -1.
   * @param now Time in milliseconds.
   * @returns New slot, or null without a keyboard.
   */
  instrumentStep(step: number, now: number): number | null {
    const slot = this.local?.instrumentStep(this.sender, step, now) ?? null;
    if (slot !== null) this.settings.setInstrument(slot);
    return slot;
  }

  /**
   * Shifts the own keyboard an octave up or down; a step past the top or the
   * bottom is ignored.
   *
   * @param step +1 or -1.
   * @param now Time in milliseconds.
   * @returns True when the octave changed.
   */
  octaveStep(step: number, now: number): boolean {
    return this.local?.octaveSet(this.sender, step > 0, now) ?? false;
  }

  /**
   * Returns the own keyboard's octave.
   *
   * @returns 0 for the lowest, 1 for an octave up.
   */
  getOctave(): number {
    return this.sender.getOctave() ? 1 : 0;
  }

  /**
   * Eases the own keyboard's vibrato in or out (held Shift).
   *
   * @param on New state.
   * @param now Time in milliseconds.
   */
  vibrato(on: boolean, now: number): void {
    this.local?.vibratoSet(this.sender, on, now);
  }

  /**
   * Returns the own keyboard's vibrato state.
   *
   * @returns True while on.
   */
  getVibrato(): boolean {
    return this.sender.getVibrato();
  }

  /**
   * Returns the own keyboard's instrument.
   *
   * @returns Slot.
   */
  getInstrument(): number {
    return this.sender.getInstrument();
  }

  /**
   * Adds the own keyboard to an outgoing snapshot: always in full ones, and in
   * the others while events still need a frame.
   *
   * @param snapshot Outgoing snapshot.
   * @param now Frame time in milliseconds.
   * @param extraId Free toy id for a continuation entry, or null.
   * @returns The snapshot with its held toy and keyboard entries.
   */
  outgoing(snapshot: PlayerBallSnapshot, now: number, extraId: number | null = null): PlayerBallSnapshot {
    if (!this.local || snapshot.held === undefined) return snapshot;
    const owing = snapshot.full || this.isOwing(now);
    const entries = owing ? this.local.entries(this.sender, now, extraId) : [];
    return { ...snapshot, held: PLAYER_TOY_KEYBOARD, ...(entries.length > 0 ? { keyboard: entries } : {}) };
  }

  /**
   * Tells whether the own keyboard owes more events than one entry holds, so it
   * wants a second toy id for a continuation entry.
   *
   * @param now Frame time in milliseconds.
   * @returns True while overflowing.
   */
  isOverflowing(now: number): boolean {
    return this.local !== null && this.sender.isOverflowing(now);
  }

  /** Marks the keyboard entry of the last outgoing snapshot as sent. */
  sent(): void {
    this.local?.sent(this.sender);
  }

  /**
   * Tells whether the own keyboard still owes events to the others.
   *
   * @param now Time in milliseconds.
   * @returns True while owing.
   */
  isOwing(now: number): boolean {
    return this.local !== null && this.sender.isOwing(now, this.local.isReleased());
  }

  /**
   * Takes another member's snapshot: creates, moves or removes its keyboard.
   *
   * @param member Member id.
   * @param snapshot Decoded snapshot (held is undefined for unknown toys).
   * @param now Arrival time in milliseconds.
   * @param color Member color.
   */
  incoming(member: number, snapshot: PlayerBallSnapshot, now: number, color: number): void {
    if (snapshot.held === undefined) return;
    if (snapshot.held !== PLAYER_TOY_KEYBOARD) return this.remove(member);
    if (!snapshot.keyboard) return;
    const remote = this.remotes.get(member) ?? this.add(member, color);
    const tick = remote.clock.timeOf(snapshot.tick, now);
    const packet = playerKeyboardEntriesDecode(snapshot.keyboard, tick);
    if (packet) remote.incoming(packet, now, tick);
  }

  /**
   * Keeps only the keyboards of members still playing.
   *
   * @param keep Selects members to keep.
   */
  keepMembers(keep: (member: number) => boolean): void {
    [...this.remotes.keys()].filter((member) => !keep(member)).forEach((member) => this.remove(member));
  }

  /**
   * Shows due notes and animates every keyboard.
   *
   * @param now Time in milliseconds.
   * @returns True while a keyboard is shown.
   */
  update(now: number): boolean {
    const seconds = this.lastUpdate === null ? 0 : Math.min(0.1, (now - this.lastUpdate) / 1000);
    this.lastUpdate = now;
    this.remotes.forEach((remote) => remote.showDue(now));
    this.instances().forEach((keyboard) => keyboard.animate(seconds));
    if (this.instances().length === 0) this.lastUpdate = null;
    return this.instances().length > 0;
  }

  /** Removes every keyboard (leaving the room or play mode). */
  clear(): void {
    this.putAway();
    this.keepMembers(() => false);
  }

  /**
   * Lists every shown keyboard.
   *
   * @returns Keyboards.
   */
  private instances(): PlayerKeyboardInstance[] {
    return [...(this.local ? [this.local] : []), ...this.remotes.values()];
  }

  /**
   * Shows a member's keyboard and puts its character's hands on it.
   *
   * @param member Member id.
   * @param color Member color.
   * @returns Keyboard.
   */
  private add(member: number, color: number): PlayerKeyboardRemote {
    const remote = new PlayerKeyboardRemote(this.options.view, color, this.synth);
    this.remotes.set(member, remote);
    this.options.hands?.(member, remote.hands);
    return remote;
  }

  /**
   * Removes a member's keyboard and frees its hands.
   *
   * @param member Member id.
   */
  private remove(member: number): void {
    const remote = this.remotes.get(member);
    if (!remote) return;
    this.remotes.delete(member);
    remote.dispose();
    this.options.hands?.(member, null);
  }
}
