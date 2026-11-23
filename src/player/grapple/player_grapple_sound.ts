import * as THREE from 'three';
import { audioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';
import { AUDIO_ROOM_CHARACTER_DRY_2D } from '@/audio/space/audio_room_character.js';
import { audioSpaceProbe } from '@/audio/space/audio_space_probe.js';
import { audioSpatialBus } from '@/audio/spatial/audio_spatial_bus.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import {
  PLAYER_GRAPPLE_FALLOFF_FULL_METERS,
  PLAYER_GRAPPLE_FALLOFF_SILENT_METERS,
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

/** Mono into the panner (turning the head pans it at equal power). */
const PLAYER_GRAPPLE_MONO: AudioNodeOptions = { channelCount: 1, channelCountMode: 'explicit' };

/** The running hum: two detuned saws through a lowpass. */
interface PlayerGrappleHum {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
}

/**
 * A player's grapple sounds, synthesized: a zap sweeping down when the beam
 * hooks, a hum while it pulls that rises with speed, a short snap when letting
 * go and a dull fizz on a miss. They come from the player (placed every frame)
 * through the spatial bus with a linear falloff that is silent by 20 m, and
 * send into the shared reverb set to the room around the player. A handful of
 * nodes, only while heard.
 */
export class PlayerGrappleSound {
  private output: GainNode | null = null;
  private panner: PannerNode | null = null;
  private hum: PlayerGrappleHum | null = null;
  private readonly position = new THREE.Vector3();

  /**
   * Creates silent sounds.
   *
   * @param context Audio context source.
   * @param volume Loudness (others' beams are quieter than the own).
   */
  constructor(
    private readonly context: PlayerGrappleAudioContext = playerGrappleEditorContext,
    private readonly volume: number = PLAYER_GRAPPLE_VOLUME.own,
  ) {}

  /**
   * Moves the sounds to the player (listener from the play camera).
   *
   * @param position Player position.
   */
  place(position: THREE.Vector3): void {
    this.position.copy(position);
    const panner = this.panner;
    if (!panner) return;
    const camera = audioViewportFocus.getPerspectiveCamera();
    audioSpatialBus.placeSourcePanner(panner.context as AudioContext, panner, {
      mode: camera ? 'spatial3d' : 'mono',
      camera,
      sourcePosition: this.position,
    });
  }

  /** Zaps and starts the hum (the beam hooked). */
  hook(): void {
    const context = this.context();
    if (!context) return;
    this.roomApply();
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

  /** Silences everything and frees the output (the player left). */
  dispose(): void {
    this.humStop();
    const nodes = [this.output, this.panner];
    this.output = null;
    this.panner = null;
    setTimeout(() => nodes.forEach((node) => node?.disconnect()), 250);
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
   * Sets the shared reverb to the room around the player, as every editor sound
   * does before it plays (dry on a 2D view).
   */
  private roomApply(): void {
    const spatial = audioViewportFocus.getPerspectiveCamera() !== null;
    const room = spatial ? audioSpaceProbe.sampleRoomCharacterAt(this.position) : AUDIO_ROOM_CHARACTER_DRY_2D;
    audioEffectSoftReverb.applyRoomCharacter(room);
  }

  /**
   * Lazily creates the output: the volume, panned at the player through the
   * spatial bus with the grapple falloff, and sent from the panner into the
   * shared reverb (so the reverb fades with distance too).
   *
   * @param context Audio context.
   * @returns Output gain.
   */
  private outputFor(context: AudioContext): GainNode {
    if (this.output?.context === context) return this.output;
    this.output = new GainNode(context, { gain: this.volume, ...PLAYER_GRAPPLE_MONO });
    this.panner = Object.assign(audioSpatialBus.createSourcePanner(context), {
      distanceModel: 'linear',
      refDistance: PLAYER_GRAPPLE_FALLOFF_FULL_METERS,
      maxDistance: PLAYER_GRAPPLE_FALLOFF_SILENT_METERS,
      rolloffFactor: 1,
    } satisfies Partial<PannerNode>);
    this.output.connect(this.panner);
    this.panner.connect(audioEffectSoftReverb.getWetSendInput(context));
    this.place(this.position);
    return this.output;
  }
}
