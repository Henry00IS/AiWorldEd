import * as THREE from 'three';
import { audioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';
import { AUDIO_ROOM_CHARACTER_DRY_2D } from '@/audio/space/audio_room_character.js';
import { audioSpaceProbe } from '@/audio/space/audio_space_probe.js';
import { audioSpatialBus } from '@/audio/spatial/audio_spatial_bus.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import { PLAYER_KEYBOARD_FADE_SECONDS } from './player_keyboard_constants.js';
import { playerKeyboardChoir } from './player_keyboard_choir.js';
import { PLAYER_KEYBOARD_INSTRUMENTS, type PlayerKeyboardInstrument } from './player_keyboard_instruments.js';
import { playerKeyboardSampleLoad } from './player_keyboard_samples.js';
import { PlayerKeyboardVibrato } from './player_keyboard_vibrato.js';

/** Peak voice level before the instrument level. */
const PLAYER_KEYBOARD_PEAK = 0.3;
/** Attack time. */
const PLAYER_KEYBOARD_ATTACK_SECONDS = 0.005;
/** Decay time constant toward the sustain level. */
const PLAYER_KEYBOARD_DECAY_SECONDS = 0.06;
/** Sustain share of the peak. */
const PLAYER_KEYBOARD_SUSTAIN = 0.55;
/** Release time constant (about 200 ms to silence). */
const PLAYER_KEYBOARD_RELEASE_SECONDS = 0.045;
/**
 * Organ partials over the half-pitch base for the 16', 8', 4', 2 2/3' and 2'
 * drawbars.
 */
const PLAYER_KEYBOARD_DRAWBAR_HARMONICS = [1, 2, 4, 6, 8];
/** Organ vibrato rate. */
const PLAYER_KEYBOARD_VIBRATO_HZ = 6.4;
/** Organ vibrato depth in cents. */
const PLAYER_KEYBOARD_VIBRATO_CENTS = 7;
/**
 * Limiter threshold of the keyboard bus in dB (only a pile of voices reaches
 * it). With the makeup undone it caps the bus near -3.4 dBFS, so after the 80%
 * volume, panning and the reverb tail the keyboard peaks stay under -3 dBFS.
 */
const PLAYER_KEYBOARD_LIMIT_DB = -8;
/** Limiter ratio (hard limiting above the threshold). */
const PLAYER_KEYBOARD_LIMIT_RATIO = 20;
/**
 * Input level that undoes the compressor's automatic makeup gain, which the Web
 * Audio spec sets to (1 / curve(1))^0.6, so quiet playing keeps its level.
 */
const PLAYER_KEYBOARD_LIMIT_MAKEUP_UNDO =
  10 ** ((0.6 * PLAYER_KEYBOARD_LIMIT_DB * (1 - 1 / PLAYER_KEYBOARD_LIMIT_RATIO)) / 20);
/**
 * Volume of the keyboard after its limiter, for every slot: 80% in each ear at
 * the center once the mono signal is panned (equal power: -3 dB per side).
 */
const PLAYER_KEYBOARD_VOLUME = 0.8 * Math.SQRT2;
/**
 * Mono into the panner, so turning the head moves the sound between the ears at
 * equal power instead of panning a doubled stereo copy up to +6 dB.
 */
const PLAYER_KEYBOARD_MONO: Partial<GainNode> = { channelCount: 1, channelCountMode: 'explicit' };
/**
 * Distance falloff of the keyboard only (its reverb send follows it): full
 * level within 6 m (playing it, or a third-person camera), then (distance /
 * 6)^-1.82, so about -8 dB at 10 m, -19 dB at 20 m and -30 dB at 40 m, falling
 * on beyond.
 */
const PLAYER_KEYBOARD_FALLOFF: Partial<PannerNode> = {
  distanceModel: 'exponential',
  refDistance: 6,
  rolloffFactor: 1.82,
  maxDistance: 10000,
};

/**
 * Running nodes of one instrument in a note: the envelope is only ever
 * scheduled once (attack and decay), the release multiplies it down toward
 * silence, so no value is read back or cancelled and the level can never jump
 * up.
 */
interface PlayerKeyboardVoiceLayer {
  source: AudioScheduledSourceNode;
  release: GainNode;
  /** Release time constant of its instrument. */
  seconds: number;
}

/** One key's note: one layer per instrument of its slot, started together. */
interface PlayerKeyboardVoice {
  layers: PlayerKeyboardVoiceLayer[];
  start: number;
}

/** Envelope and audio start time of a note being built. */
interface PlayerKeyboardNoteStart {
  envelope: GainNode;
  start: number;
}

/** Returns the shared audio context when sound is on. */
export type PlayerKeyboardAudioContext = () => AudioContext | null;

/**
 * Returns the editor's shared audio context while editor audio is enabled.
 *
 * @returns Context or null.
 */
function playerKeyboardEditorContext(): AudioContext | null {
  return audioSettings.isEnabled() ? audioContextHost.ensureContext() : null;
}

/**
 * Returns the frequency of a MIDI pitch.
 *
 * @param pitch MIDI pitch.
 * @returns Frequency in hertz.
 */
function playerKeyboardHertz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

/**
 * Builds the keyboard bus limiter.
 *
 * @param context Audio context.
 * @returns Hard-knee compressor acting as a limiter.
 */
function playerKeyboardLimiter(context: AudioContext): DynamicsCompressorNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = PLAYER_KEYBOARD_LIMIT_DB;
  limiter.knee.value = 0;
  limiter.ratio.value = PLAYER_KEYBOARD_LIMIT_RATIO;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  return limiter;
}

/**
 * Voices of one keyboard: ADSR notes, one voice per key, started now or at a
 * scheduled audio time, into one limited output that is panned at the keyboard
 * by the editor's spatial bus and sent into the shared reverb.
 */
export class PlayerKeyboardSynth {
  private readonly voices = new Map<number, PlayerKeyboardVoice>();
  private readonly live = new Set<PlayerKeyboardVoice>();
  private output: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private volume: GainNode | null = null;
  private panner: PannerNode | null = null;
  private readonly position = new THREE.Vector3();
  private readonly shiftVibrato = new PlayerKeyboardVibrato();
  private disposed = false;

  /**
   * Creates a synth for one keyboard.
   *
   * @param context Audio context source.
   * @param instruments Instrument slots.
   */
  constructor(
    private readonly context: PlayerKeyboardAudioContext = playerKeyboardEditorContext,
    private readonly instruments: readonly PlayerKeyboardInstrument[] = PLAYER_KEYBOARD_INSTRUMENTS,
  ) {}

  /**
   * Starts loading the sample slots and prepares the choir, so their first
   * notes are not missed.
   */
  preload(): void {
    const context = this.context();
    this.instruments.forEach((instrument) => {
      if (context && 'sampleUrl' in instrument && instrument.sampleUrl) playerKeyboardSampleLoad(instrument.sampleUrl);
      if (context && 'choir' in instrument) playerKeyboardChoir.preload(context);
    });
  }

  /**
   * Maps a time on the page clock to the audio clock, once per note, so the
   * note is started by the audio thread however late the frame runs.
   *
   * @param ms Page time in milliseconds.
   * @param now Current page time in milliseconds.
   * @returns Audio time in seconds, or undefined without sound.
   */
  audioTimeOf(ms: number, now: number): number | undefined {
    const context = this.disposed ? null : this.context();
    return context ? context.currentTime + (ms - now) / 1000 : undefined;
  }

  /**
   * Starts a note, replacing the key's sounding voice (one voice per key, so
   * the key's note-off ends it whatever octave it sounds in).
   *
   * @param pitch MIDI pitch of the key.
   * @param slot Instrument slot.
   * @param at Audio time to start at (now when omitted or past).
   * @param transpose Semitones the octave shift adds to the sounding pitch.
   */
  noteOn(pitch: number, slot: number, at?: number, transpose = 0): void {
    const context = this.disposed ? null : this.context();
    const instrument = this.instruments[slot];
    if (!context || !instrument) return;
    const start = Math.max(at ?? 0, context.currentTime);
    this.noteOff(pitch, start, PLAYER_KEYBOARD_FADE_SECONDS / 3);
    const mix = 'layers' in instrument ? instrument.level : 1;
    const layers = this.layersOf(instrument).flatMap(
      (layer) => this.layerStart(context, layer, pitch + transpose, start, mix) ?? [],
    );
    if (layers.length === 0) return;
    this.roomApply();
    this.voiceAdd(pitch, { layers, start });
  }

  /**
   * Makes a started note the key's voice, keeping it live until every layer has
   * ended.
   *
   * @param pitch MIDI pitch.
   * @param voice Started voice.
   */
  private voiceAdd(pitch: number, voice: PlayerKeyboardVoice): void {
    this.voices.set(pitch, voice);
    this.live.add(voice);
    let sounding = voice.layers.length;
    voice.layers.forEach(({ source }) =>
      source.addEventListener('ended', () => {
        sounding -= 1;
        if (sounding === 0) this.live.delete(voice);
      }),
    );
  }

  /**
   * Returns the instruments a slot plays per note: its layers, or itself.
   *
   * @param instrument Instrument slot.
   * @returns Instruments to start together.
   */
  private layersOf(instrument: PlayerKeyboardInstrument): PlayerKeyboardInstrument[] {
    if (!('layers' in instrument)) return [instrument];
    return instrument.layers.flatMap((slot) => this.instruments[slot] ?? []);
  }

  /**
   * Starts one instrument of a note into the instrument's bus.
   *
   * @param context Audio context.
   * @param instrument Instrument.
   * @param pitch MIDI pitch.
   * @param start Audio start time.
   * @param mix Share of the instrument's level (below 1 in a layered slot).
   * @returns Running layer, or null while its sample is not loaded.
   */
  private layerStart(
    context: AudioContext,
    instrument: PlayerKeyboardInstrument,
    pitch: number,
    start: number,
    mix: number,
  ): PlayerKeyboardVoiceLayer | null {
    const envelope = this.envelope(context, instrument, start, mix);
    const source = this.sourceFor(context, instrument, pitch, { envelope, start });
    if (!source) return null;
    const release = context.createGain();
    source.connect(envelope).connect(release).connect(this.outputFor(context));
    if ('detune' in source) this.shiftVibrato.drive(source, [source.detune as AudioParam]);
    source.start(start);
    source.addEventListener('ended', () => [envelope, release].forEach((node) => node.disconnect()));
    return { source, release, seconds: instrument.release ?? PLAYER_KEYBOARD_RELEASE_SECONDS };
  }

  /**
   * Releases one note.
   *
   * @param pitch MIDI pitch.
   * @param at Audio time to release at (now when omitted or past).
   * @param seconds Release time constant (the instrument's by default; the
   *   forced fade is a few milliseconds).
   */
  noteOff(pitch: number, at?: number, seconds?: number): void {
    const voice = this.voices.get(pitch);
    if (!voice) return;
    this.voices.delete(pitch);
    this.fade(voice, at, seconds);
  }

  /**
   * Eases the held-Shift vibrato in or out on every voice of every slot.
   *
   * @param on New state.
   * @param at Audio time of the change (now when omitted or past).
   */
  vibratoSet(on: boolean, at?: number): void {
    const context = this.disposed ? null : this.context();
    if (context) this.shiftVibrato.set(context, on, at);
  }

  /**
   * Moves the source to the keyboard (listener from the play camera).
   *
   * @param position Keyboard world position.
   */
  place(position: THREE.Vector3): void {
    this.position.copy(position);
    const context = this.output?.context as AudioContext | undefined;
    if (!context || !this.panner) return;
    const camera = audioViewportFocus.getPerspectiveCamera();
    audioSpatialBus.placeSourcePanner(context, this.panner, {
      mode: camera ? 'spatial3d' : 'mono',
      camera,
      sourcePosition: this.position,
    });
  }

  /**
   * Sets the shared reverb to the room around the keyboard, as every editor
   * sound does before it plays (dry on a 2D view).
   */
  private roomApply(): void {
    const spatial = audioViewportFocus.getPerspectiveCamera() !== null;
    const room = spatial ? audioSpaceProbe.sampleRoomCharacterAt(this.position) : AUDIO_ROOM_CHARACTER_DRY_2D;
    audioEffectSoftReverb.applyRoomCharacter(room);
  }

  /**
   * Returns the number of sounding voices.
   *
   * @returns Voice count.
   */
  getVoiceCount(): number {
    return this.voices.size;
  }

  /**
   * Tells whether audio nodes are still owned.
   *
   * @returns True while an output exists.
   */
  hasOutput(): boolean {
    return this.output !== null;
  }

  /**
   * Fades every note out in a few milliseconds, then frees the output and
   * panner.
   */
  dispose(): void {
    this.live.forEach((voice) => this.fade(voice, undefined, PLAYER_KEYBOARD_FADE_SECONDS / 3));
    this.voices.clear();
    const nodes = [this.output, this.limiter, this.volume, this.panner];
    this.shiftVibrato.dispose();
    this.output = null;
    this.limiter = null;
    this.volume = null;
    this.panner = null;
    this.disposed = true;
    setTimeout(() => nodes.forEach((node) => node?.disconnect()), 250);
  }

  /**
   * Fades every layer of a voice toward silence from wherever its level is then
   * (a later fade only ever starts lower), stopping it once silent; a voice
   * that has not started yet never starts.
   *
   * @param voice Voice.
   * @param at Audio time to fade from (now when omitted or past).
   * @param seconds Fade time constant (each layer's own release when omitted).
   */
  private fade(voice: PlayerKeyboardVoice, at: number | undefined, seconds?: number): void {
    voice.layers.forEach((layer) => {
      const now = layer.release.context.currentTime;
      const from = Math.max(at ?? 0, now);
      const constant = seconds ?? layer.seconds;
      layer.release.gain.setTargetAtTime(0, from, constant);
      layer.source.stop(at === undefined && voice.start > now ? now : from + constant * 8);
    });
  }

  /**
   * Builds an envelope starting from silence: a quick attack (or the
   * instrument's) and a short decay to the sustain. Its gain is silent before
   * the automation too, as the audio thread can render a note started at "now"
   * before its scheduled events apply, which at the default gain of 1 played it
   * up to three times too loud.
   *
   * @param context Audio context.
   * @param instrument Instrument (level, attack and sustain).
   * @param start Audio start time.
   * @param mix Share of the instrument's level.
   * @returns Envelope gain.
   */
  private envelope(context: AudioContext, instrument: PlayerKeyboardInstrument, start: number, mix: number): GainNode {
    const gain = context.createGain();
    gain.gain.value = 0;
    const peak = PLAYER_KEYBOARD_PEAK * instrument.level * mix;
    const attacked = start + (instrument.attack ?? PLAYER_KEYBOARD_ATTACK_SECONDS);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, attacked);
    gain.gain.setTargetAtTime(
      peak * (instrument.sustain ?? PLAYER_KEYBOARD_SUSTAIN),
      attacked,
      PLAYER_KEYBOARD_DECAY_SECONDS,
    );
    return gain;
  }

  /**
   * Creates an organ tone: drawbar sine partials over half the pitch (so the
   * 16' sub fits the wave), with a slight vibrato that stops with the note.
   *
   * @param context Audio context.
   * @param drawbars Drawbar levels.
   * @param pitch MIDI pitch.
   * @returns Unstarted oscillator.
   */
  private organ(context: AudioContext, drawbars: readonly number[], pitch: number): OscillatorNode {
    const imag = new Float32Array(9);
    drawbars.forEach((level, index) => (imag[PLAYER_KEYBOARD_DRAWBAR_HARMONICS[index] ?? 0] = level));
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(context.createPeriodicWave(new Float32Array(9), imag));
    oscillator.frequency.value = playerKeyboardHertz(pitch) / 2;
    this.vibrato(context, oscillator, [oscillator.detune], PLAYER_KEYBOARD_VIBRATO_HZ, PLAYER_KEYBOARD_VIBRATO_CENTS);
    return oscillator;
  }

  /**
   * Adds a sine vibrato to pitch parameters that runs until the owning source
   * ends.
   *
   * @param context Audio context.
   * @param owner Source whose end stops the vibrato.
   * @param detunes Detune parameters to modulate.
   * @param hertz Vibrato rate.
   * @param cents Vibrato depth.
   */
  private vibrato(
    context: AudioContext,
    owner: AudioScheduledSourceNode,
    detunes: AudioParam[],
    hertz: number,
    cents: number,
  ): void {
    const vibrato = context.createOscillator();
    vibrato.frequency.value = hertz;
    const depth = context.createGain();
    depth.gain.value = cents;
    vibrato.connect(depth);
    detunes.forEach((detune) => depth.connect(detune));
    vibrato.start();
    owner.addEventListener('ended', () => (vibrato.stop(), depth.disconnect()));
  }

  /**
   * Creates an oscillator for a wave or organ slot, or a buffer source for a
   * sample slot (nothing for a layered slot, whose layers start their own).
   *
   * @param context Audio context.
   * @param instrument Instrument slot.
   * @param pitch MIDI pitch.
   * @param note Envelope and start time of the note (the choir starts its other
   *   singers and its breath into the envelope).
   * @returns Unstarted source, or null while a sample is not loaded.
   */
  private sourceFor(
    context: AudioContext,
    instrument: PlayerKeyboardInstrument,
    pitch: number,
    note: PlayerKeyboardNoteStart,
  ): AudioScheduledSourceNode | null {
    if ('drawbars' in instrument) return this.organ(context, instrument.drawbars, pitch);
    if ('choir' in instrument) return playerKeyboardChoir.sing(context, pitch, note, this.shiftVibrato);
    if ('sampleUrl' in instrument) return this.sample(context, instrument, pitch);
    if (!('wave' in instrument)) return null;
    const oscillator = context.createOscillator();
    oscillator.type = instrument.wave;
    oscillator.frequency.value = playerKeyboardHertz(pitch);
    return oscillator;
  }

  /**
   * Creates a buffer source pitched from the sample's root note that loops
   * while held when it has a loop (one-shot otherwise).
   *
   * @param context Audio context.
   * @param instrument Sample slot.
   * @param pitch MIDI pitch.
   * @returns Unstarted source, or null while the sample is not loaded.
   */
  private sample(
    context: AudioContext,
    instrument: Extract<PlayerKeyboardInstrument, { sampleUrl: string | null }>,
    pitch: number,
  ): AudioBufferSourceNode | null {
    const buffer = instrument.sampleUrl ? playerKeyboardSampleLoad(instrument.sampleUrl) : null;
    if (!buffer) return null;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((pitch - instrument.rootPitch) / 12);
    const loop = instrument.loop;
    if (loop) Object.assign(source, { loop: true, loopStart: loop.start, loopEnd: loop.end });
    return source;
  }

  /**
   * Lazily creates the output: the voices are limited so a pile of them can
   * never blast, turned to the keyboard volume, panned through the spatial bus
   * with the keyboard's own distance falloff, and sent from the panner into the
   * shared reverb (so the reverb fades with distance too).
   *
   * @param context Audio context.
   * @returns Output gain the voices connect to.
   */
  private outputFor(context: AudioContext): GainNode {
    if (this.output) return this.output;
    this.output = context.createGain();
    this.output.gain.value = PLAYER_KEYBOARD_LIMIT_MAKEUP_UNDO;
    this.limiter = playerKeyboardLimiter(context);
    this.volume = Object.assign(context.createGain(), PLAYER_KEYBOARD_MONO);
    this.volume.gain.value = PLAYER_KEYBOARD_VOLUME;
    this.panner = Object.assign(audioSpatialBus.createSourcePanner(context), PLAYER_KEYBOARD_FALLOFF);
    this.output.connect(this.limiter).connect(this.volume).connect(this.panner);
    this.panner.connect(audioEffectSoftReverb.getWetSendInput(context));
    this.place(this.position);
    return this.output;
  }
}
