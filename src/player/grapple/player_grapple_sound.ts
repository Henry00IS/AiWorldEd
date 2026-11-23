import { audioContextHost } from '@/audio/context/audio_context_host.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';
import {
  PLAYER_GRAPPLE_HUM_HERTZ,
  PLAYER_GRAPPLE_HUM_HERTZ_PER_SPEED,
  PLAYER_GRAPPLE_VOLUME,
} from './player_grapple_constants.js';

/** Returns the shared audio context when sound is on. */
export type PlayerGrappleAudioContext = () => AudioContext | null;

/**
 * Returns the editor's shared audio context while editor audio is enabled.
 *
 * @returns Context or null.
 */
function playerGrappleEditorContext(): AudioContext | null {
  return audioSettings.isEnabled() ? audioContextHost.ensureContext() : null;
}

/** The running hum: two detuned saws through a lowpass. */
interface PlayerGrappleHum {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
}

/**
 * The player's own grapple sounds, synthesized: a zap sweeping down when the
 * beam hooks, a hum while it pulls that rises with speed, a short snap when
 * letting go and a dull fizz on a miss. A handful of nodes, only while heard.
 */
export class PlayerGrappleSound {
  private output: GainNode | null = null;
  private hum: PlayerGrappleHum | null = null;

  /**
   * Creates silent sounds.
   *
   * @param context Audio context source.
   */
  constructor(private readonly context: PlayerGrappleAudioContext = playerGrappleEditorContext) {}

  /** Zaps and starts the hum (the beam hooked). */
  hook(): void {
    const context = this.context();
    if (!context) return;
    this.sweep(context, 'sawtooth', 1900, 180, 0.16, 0.5);
    this.sweep(context, 'square', 3800, 700, 0.07, 0.18);
    this.humStart(context);
  }

  /** Stops the hum with a short snap (let go). */
  release(): void {
    const context = this.context();
    this.humStop();
    if (context) this.sweep(context, 'triangle', 700, 1500, 0.08, 0.3);
  }

  /** Fizzes (the shot hit nothing). */
  miss(): void {
    const context = this.context();
    if (context) this.sweep(context, 'sawtooth', 420, 70, 0.2, 0.22);
  }

  /**
   * Follows the speed with the hum's pitch, brightness and level.
   *
   * @param speed Body speed in meters per second.
   */
  pulling(speed: number): void {
    const hum = this.hum;
    if (!hum) return;
    const time = hum.gain.context.currentTime;
    const hertz = PLAYER_GRAPPLE_HUM_HERTZ + PLAYER_GRAPPLE_HUM_HERTZ_PER_SPEED * speed;
    hum.oscillators.forEach((oscillator, index) =>
      oscillator.frequency.setTargetAtTime(hertz * (index === 0 ? 1 : 1.505), time, 0.05),
    );
    hum.filter.frequency.setTargetAtTime(260 + 70 * speed, time, 0.05);
    hum.gain.gain.setTargetAtTime(0.1 + 0.006 * speed, time, 0.05);
  }

  /** Silences everything at once. */
  stop(): void {
    this.humStop();
  }

  /**
   * Plays one pitch sweep with a fast attack and an exponential fade.
   *
   * @param context Audio context.
   * @param type Wave shape.
   * @param from Start frequency.
   * @param to End frequency.
   * @param seconds Length.
   * @param level Peak level.
   */
  private sweep(
    context: AudioContext,
    type: OscillatorType,
    from: number,
    to: number,
    seconds: number,
    level: number,
  ): void {
    const time = context.currentTime;
    const oscillator = new OscillatorNode(context, { type, frequency: from });
    const gain = new GainNode(context, { gain: 0 });
    oscillator.frequency.exponentialRampToValueAtTime(to, time + seconds);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + seconds);
    oscillator.connect(gain).connect(this.outputFor(context));
    oscillator.start(time);
    oscillator.stop(time + seconds + 0.02);
    oscillator.onended = () => gain.disconnect();
  }

  /**
   * Starts the hum.
   *
   * @param context Audio context.
   */
  private humStart(context: AudioContext): void {
    this.humStop();
    const time = context.currentTime;
    const gain = new GainNode(context, { gain: 0 });
    const filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: 300, Q: 4 });
    const oscillators = [0, 1].map(
      () => new OscillatorNode(context, { type: 'sawtooth', frequency: PLAYER_GRAPPLE_HUM_HERTZ }),
    );
    oscillators.forEach((oscillator) => {
      oscillator.connect(filter);
      oscillator.start(time);
    });
    filter.connect(gain).connect(this.outputFor(context));
    gain.gain.setTargetAtTime(0.1, time, 0.03);
    this.hum = { oscillators, filter, gain };
  }

  /** Fades the hum out quickly and frees it. */
  private humStop(): void {
    const hum = this.hum;
    if (!hum) return;
    this.hum = null;
    const time = hum.gain.context.currentTime;
    hum.gain.gain.cancelScheduledValues(time);
    hum.gain.gain.setTargetAtTime(0, time, 0.02);
    hum.oscillators.forEach((oscillator) => oscillator.stop(time + 0.12));
    hum.oscillators[0]!.onended = () => hum.gain.disconnect();
  }

  /**
   * Lazily creates the output into the speakers.
   *
   * @param context Audio context.
   * @returns Output gain.
   */
  private outputFor(context: AudioContext): GainNode {
    if (this.output?.context === context) return this.output;
    this.output = new GainNode(context, { gain: PLAYER_GRAPPLE_VOLUME });
    this.output.connect(context.destination);
    return this.output;
  }
}
