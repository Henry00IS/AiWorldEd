import { PlayerBallClock } from '@/player/ball/player_ball_clock.js';
import { PLAYER_KEYBOARD_PLAYBACK_DELAY_MS } from './player_keyboard_constants.js';
import { PlayerKeyboardInstance } from './player_keyboard_instance.js';
import type { PlayerKeyboardPacket } from './player_keyboard_protocol.js';
import {
  PlayerKeyboardReceiver,
  type PlayerKeyboardNote,
  type PlayerKeyboardVibratoChange,
} from './player_keyboard_receiver.js';

/**
 * How long before an all-released frame a held note must have started to count
 * as stuck, so a note pressed just after that frame is never cut when the
 * frames' clock mapping jitters.
 */
const PLAYER_KEYBOARD_STUCK_MARGIN_MS = 100;

/** A note as scheduled on the audio clock, for diagnostics. */
export interface PlayerKeyboardScheduled extends PlayerKeyboardNote {
  at: number | undefined;
}

/** A vibrato change as scheduled on the audio clock, for diagnostics. */
export interface PlayerKeyboardVibratoScheduled extends PlayerKeyboardVibratoChange {
  at: number | undefined;
}

/**
 * Another member's keyboard: each new note is put on the audio clock once, at
 * its sender time plus a fixed delay (so jitter and one lost frame do not
 * show), and the audio thread plays it on time however slow the frames are. The
 * keys and hands follow on the frame loop. Once every event up to a frame that
 * says no key is held has played, notes still held (their note-off lost in both
 * frames) are released.
 */
export class PlayerKeyboardRemote extends PlayerKeyboardInstance {
  readonly clock = new PlayerBallClock();
  readonly receiver = new PlayerKeyboardReceiver();
  readonly scheduled: PlayerKeyboardScheduled[] = [];
  readonly vibratoScheduled: PlayerKeyboardVibratoScheduled[] = [];
  readonly stuckReleased: number[] = [];
  private readonly queue: PlayerKeyboardNote[] = [];
  private readonly releasedTicks: number[] = [];
  private readonly started = new Map<number, number>();

  /**
   * Places the keyboard and schedules the entry's new notes and vibrato
   * changes.
   *
   * @param packet Decoded entry (times on the local clock).
   * @param now Arrival time in milliseconds.
   * @param tick Local time of the frame tick in milliseconds.
   */
  incoming(packet: PlayerKeyboardPacket, now: number, tick: number = now): void {
    this.place(this.model.root.position.fromArray(packet.position), packet.yaw);
    this.receiver.accept(packet).forEach((note) => this.schedule(note, now));
    this.receiver.takeVibratoChanges().forEach((change) => this.vibratoSchedule(change, now));
    if (packet.released) this.releasedTicks.push(tick);
  }

  /**
   * Sinks and raises the keys of the notes that are due, in time order with the
   * all-released checks. Held notes stay held until their release (a sustained
   * loop has no time limit).
   *
   * @param now Time in milliseconds.
   */
  showDue(now: number): void {
    const due = (time: number | undefined): boolean =>
      time !== undefined && time + PLAYER_KEYBOARD_PLAYBACK_DELAY_MS <= now;
    for (;;) {
      const note = this.queue[0];
      const tick = this.releasedTicks[0];
      if (due(tick) && (!note || !due(note.time) || (tick ?? 0) < note.time)) {
        this.releasedTicks.shift();
        this.stuckRelease(tick ?? 0);
      } else if (note && due(note.time)) this.show(this.queue.shift() ?? note, now);
      else return;
    }
  }

  /**
   * Sinks or raises one due note's key.
   *
   * @param note Due note.
   * @param now Time in milliseconds.
   */
  private show(note: PlayerKeyboardNote, now: number): void {
    if (note.down) this.held.set(note.pitch, now);
    else this.held.delete(note.pitch);
    if (note.down) this.started.set(note.pitch, note.time);
    else this.started.delete(note.pitch);
  }

  /**
   * Releases, with their normal release, held notes that started well before a
   * frame saying no key was held and that no event still to come changes: every
   * event up to that frame has played.
   *
   * @param tick Local time of the all-released frame in milliseconds.
   */
  private stuckRelease(tick: number): void {
    const pending = new Set(this.queue.map((note) => note.pitch));
    const before = (pitch: number): boolean =>
      (this.started.get(pitch) ?? tick) < tick - PLAYER_KEYBOARD_STUCK_MARGIN_MS;
    [...this.held.keys()]
      .filter((pitch) => !pending.has(pitch) && before(pitch))
      .forEach((pitch) => {
        this.release(pitch);
        this.started.delete(pitch);
        this.stuckReleased.push(pitch);
      });
  }

  /**
   * Starts or releases a note at its audio time and queues it for the keys.
   *
   * @param note Received note.
   * @param now Arrival time in milliseconds.
   */
  private schedule(note: PlayerKeyboardNote, now: number): void {
    const at = this.synth.audioTimeOf(note.time + PLAYER_KEYBOARD_PLAYBACK_DELAY_MS, now);
    if (note.down) this.synth.noteOn(note.pitch, note.instrument, at, note.transpose);
    else this.synth.noteOff(note.pitch, at);
    this.queue.push(note);
    this.scheduled.push({ ...note, at });
    if (this.scheduled.length > 64) this.scheduled.shift();
  }

  /**
   * Eases the vibrato in or out at its audio time.
   *
   * @param change Received change.
   * @param now Arrival time in milliseconds.
   */
  private vibratoSchedule(change: PlayerKeyboardVibratoChange, now: number): void {
    const at = this.synth.audioTimeOf(change.time + PLAYER_KEYBOARD_PLAYBACK_DELAY_MS, now);
    this.synth.vibratoSet(change.vibrato, at);
    this.vibratoScheduled.push({ ...change, at });
    if (this.vibratoScheduled.length > 64) this.vibratoScheduled.shift();
  }
}
