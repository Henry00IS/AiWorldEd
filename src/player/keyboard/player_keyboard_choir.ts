import choirVoice from './player_keyboard_choir_voice.json';
import type { PlayerKeyboardVibrato } from './player_keyboard_vibrato.js';

/**
 * Ensemble singers of every choir note: static detune in cents, vibrato rate
 * (whole cycles per control loop, so the loop is seamless) and vibrato depth in
 * cents.
 */
const PLAYER_KEYBOARD_CHOIR_SINGERS = [
  { detune: -12, hertz: 30 / 6, cents: 11 },
  { detune: -5, hertz: 34 / 6, cents: 9 },
  { detune: 0, hertz: 32 / 6, cents: 12 },
  { detune: 6, hertz: 29 / 6, cents: 10 },
  { detune: 11, hertz: 35 / 6, cents: 8 },
];
/**
 * Length of the looping control curves. They are made at the context's own
 * rate, as resampling ten control channels per note costs more than the singers
 * do.
 */
const PLAYER_KEYBOARD_CHOIR_LOOP_SECONDS = 6;
/** Length of the looping breath. */
const PLAYER_KEYBOARD_CHOIR_BREATH_SECONDS = 2;
/** Share the vibrato depth wanders by, and the rates it can wander at. */
const PLAYER_KEYBOARD_CHOIR_WANDER = { share: 0.25, hertz: [1 / 6, 2 / 6] };
/** Share the vibrato rate wobbles by, and the rates it can wobble at. */
const PLAYER_KEYBOARD_CHOIR_WOBBLE = { share: 0.04, hertz: [1 / 6] };
/** Pitch jitter: deviation in cents, band (two poles) in hertz. */
const PLAYER_KEYBOARD_CHOIR_JITTER = { deviation: 3, hertz: 7, poles: 2 };
/** Slow pitch drift: deviation in cents, band (one pole) in hertz. */
const PLAYER_KEYBOARD_CHOIR_DRIFT = { deviation: 4, hertz: 0.4, poles: 1 };
/** Loudness shimmer of each singer: deviation as a share, band in hertz. */
const PLAYER_KEYBOARD_CHOIR_SHIMMER = { deviation: 0.007, hertz: 3, poles: 1 };
/**
 * Breath level (RMS) beside the singers, set so a held note matches the
 * approved preview within 2 dB in every third-octave band from 500 Hz up.
 */
const PLAYER_KEYBOARD_CHOIR_BREATH_LEVEL = 0.03;

/** The choir's prepared sound of one audio context. */
interface PlayerKeyboardChoirAssets {
  waves: Map<number, PeriodicWave>;
  control: AudioBuffer;
  breath: AudioBuffer;
}

/**
 * Picks one entry at random.
 *
 * @param choices Entries.
 * @returns Entry.
 */
function playerKeyboardChoirPick(choices: readonly number[]): number {
  return choices[Math.floor(Math.random() * choices.length)] ?? 0;
}

/**
 * Low-passes a looping signal with one pole, run twice round the loop so the
 * result is its seamless steady state.
 *
 * @param signal Looping signal (changed in place).
 * @param hertz Cutoff.
 * @param rate Sample rate.
 */
function playerKeyboardChoirLowpass(signal: Float32Array, hertz: number, rate: number): void {
  const share = 1 - Math.exp((-2 * Math.PI * hertz) / rate);
  const source = signal.slice();
  let level = 0;
  for (let index = 0; index < signal.length * 2; index++) {
    const at = index % signal.length;
    level += share * ((source[at] ?? 0) - level);
    if (index >= signal.length) signal[at] = level;
  }
}

/**
 * Makes looping band-limited noise with a given deviation.
 *
 * @param length Samples.
 * @param band Deviation, cutoff and number of poles.
 * @param band.deviation Standard deviation.
 * @param band.hertz Cutoff.
 * @param band.poles Number of one-pole stages.
 * @param rate Sample rate.
 * @returns Noise.
 */
function playerKeyboardChoirNoise(
  length: number,
  band: { deviation: number; hertz: number; poles: number },
  rate: number,
): Float32Array {
  const noise = Float32Array.from({ length }, () => Math.random() * 2 - 1);
  for (let pole = 0; pole < band.poles; pole++) {
    playerKeyboardChoirLowpass(noise, band.hertz, rate);
  }
  const deviation = Math.sqrt(noise.reduce((sum, value) => sum + value * value, 0) / length) || 1;
  return noise.map((value) => (value * band.deviation) / deviation);
}

/**
 * Makes one singer's looping vibrato in cents, its depth wandering and its rate
 * wobbling slowly.
 *
 * @param length Samples.
 * @param hertz Vibrato rate.
 * @param cents Vibrato depth.
 * @param rate Sample rate.
 * @returns Vibrato.
 */
function playerKeyboardChoirVibrato(length: number, hertz: number, cents: number, rate: number): Float32Array {
  const wander = playerKeyboardChoirPick(PLAYER_KEYBOARD_CHOIR_WANDER.hertz);
  const wobble = playerKeyboardChoirPick(PLAYER_KEYBOARD_CHOIR_WOBBLE.hertz);
  const offsets = [Math.random(), Math.random(), Math.random()].map((share) => share * 2 * Math.PI);
  const vibrato = new Float32Array(length);
  let phase = offsets[0] ?? 0;
  for (let index = 0; index < length; index++) {
    const seconds = index / rate;
    const wobbled =
      1 + PLAYER_KEYBOARD_CHOIR_WOBBLE.share * Math.sin(2 * Math.PI * wobble * seconds + (offsets[1] ?? 0));
    const depth =
      cents * (1 + PLAYER_KEYBOARD_CHOIR_WANDER.share * Math.sin(2 * Math.PI * wander * seconds + (offsets[2] ?? 0)));
    vibrato[index] = depth * Math.sin(phase);
    phase += (2 * Math.PI * hertz * wobbled) / rate;
  }
  return vibrato;
}

/**
 * Makes one singer's looping pitch curve in cents: its detune, vibrato, jitter
 * and drift.
 *
 * @param length Samples.
 * @param singer Singer's detune, vibrato rate and depth.
 * @param singer.detune Static detune in cents.
 * @param singer.hertz Vibrato rate.
 * @param singer.cents Vibrato depth.
 * @param rate Sample rate.
 * @returns Pitch curve.
 */
function playerKeyboardChoirPitch(
  length: number,
  singer: { detune: number; hertz: number; cents: number },
  rate: number,
): Float32Array<ArrayBuffer> {
  const jitter = playerKeyboardChoirNoise(length, PLAYER_KEYBOARD_CHOIR_JITTER, rate);
  const drift = playerKeyboardChoirNoise(length, PLAYER_KEYBOARD_CHOIR_DRIFT, rate);
  const vibrato = playerKeyboardChoirVibrato(length, singer.hertz, singer.cents, rate);
  return Float32Array.from(
    vibrato,
    (cents, index) => singer.detune + cents + (jitter[index] ?? 0) + (drift[index] ?? 0),
  );
}

/**
 * Builds the looping control curves: one pitch channel per singer, then one
 * loudness channel per singer (its shimmer, sharing the ensemble's level).
 *
 * @param context Audio context.
 * @returns Control buffer.
 */
function playerKeyboardChoirControl(context: BaseAudioContext): AudioBuffer {
  const rate = context.sampleRate;
  const length = PLAYER_KEYBOARD_CHOIR_LOOP_SECONDS * rate;
  const singers = PLAYER_KEYBOARD_CHOIR_SINGERS.length;
  const control = context.createBuffer(singers * 2, length, rate);
  const share = 1 / Math.sqrt(singers);
  PLAYER_KEYBOARD_CHOIR_SINGERS.forEach((singer, index) => {
    control.copyToChannel(playerKeyboardChoirPitch(length, singer, rate), index);
    const shimmer = playerKeyboardChoirNoise(length, PLAYER_KEYBOARD_CHOIR_SHIMMER, rate);
    control.copyToChannel(
      shimmer.map((wave) => share * (1 + wave)),
      singers + index,
    );
  });
  return control;
}

/**
 * Builds the looping breath: white noise circularly filtered by the breath
 * filter (the formants without the glottal tilt plus an airy band, high-passed
 * at 1.5 kHz), at the breath level.
 *
 * @param context Audio context.
 * @returns Breath buffer.
 */
function playerKeyboardChoirBreath(context: BaseAudioContext): AudioBuffer {
  const taps = choirVoice.breathFir;
  const length = PLAYER_KEYBOARD_CHOIR_BREATH_SECONDS * choirVoice.breathFirHz;
  const noise = Float32Array.from({ length }, () => Math.random() * 2 - 1);
  const breath = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    let sum = 0;
    for (let tap = 0; tap < taps.length; tap++) sum += (taps[tap] ?? 0) * (noise[(index + tap) % length] ?? 0);
    breath[index] = sum;
  }
  const level = Math.sqrt(breath.reduce((total, value) => total + value * value, 0) / length) || 1;
  const buffer = context.createBuffer(1, length, choirVoice.breathFirHz);
  buffer.copyToChannel(
    breath.map((value) => (value * PLAYER_KEYBOARD_CHOIR_BREATH_LEVEL) / level),
    0,
  );
  return buffer;
}

/**
 * Returns the voice zone nearest a pitch.
 *
 * @param pitch MIDI pitch.
 * @returns Zone pitch.
 */
function playerKeyboardChoirZone(pitch: number): number {
  return choirVoice.zones.reduce((best, zone) => (Math.abs(zone - pitch) < Math.abs(best - pitch) ? zone : best));
}

/**
 * Builds a zone's voice wave from its harmonics (interleaved real and imaginary
 * parts of each cosine-phase partial, so the sine part flips sign), normalized
 * to peak at 1.
 *
 * @param context Audio context.
 * @param zone Zone pitch.
 * @returns Wave.
 */
function playerKeyboardChoirWave(context: BaseAudioContext, zone: number): PeriodicWave {
  const harmonics = choirVoice.harmonics[String(zone) as keyof typeof choirVoice.harmonics] ?? [];
  const count = harmonics.length / 2 + 1;
  const real = new Float32Array(count);
  const imag = new Float32Array(count);
  for (let harmonic = 1; harmonic < count; harmonic++) {
    real[harmonic] = harmonics[(harmonic - 1) * 2] ?? 0;
    imag[harmonic] = -(harmonics[(harmonic - 1) * 2 + 1] ?? 0);
  }
  return context.createPeriodicWave(real, imag);
}

/**
 * The choir "ahh": per note five singers, each a looping single-cycle voice
 * wave (a glottal pulse through five fitted FOF formants, one wave per three
 * semitones) with its own vibrato, jitter, drift and shimmer read from shared
 * looping control curves at a random point, plus breath noise. The curves, the
 * breath and the waves are made once per audio context and shared by every
 * keyboard.
 */
export class PlayerKeyboardChoir {
  private readonly assets = new WeakMap<BaseAudioContext, PlayerKeyboardChoirAssets>();

  /**
   * Prepares the choir's sound for a context, so its first note does not wait.
   *
   * @param context Audio context.
   */
  preload(context: BaseAudioContext): void {
    this.assetsFor(context);
  }

  /**
   * Starts a choir note into its envelope: every singer and the breath start
   * with the note and stop when the returned first singer ends.
   *
   * @param context Audio context.
   * @param pitch MIDI pitch.
   * @param note Envelope and start time of the note.
   * @param note.envelope Envelope gain.
   * @param note.start Audio start time.
   * @param vibrato Shared Shift vibrato that drives every singer's pitch.
   * @returns Unstarted first singer.
   */
  sing(
    context: BaseAudioContext,
    pitch: number,
    note: { envelope: GainNode; start: number },
    vibrato: PlayerKeyboardVibrato,
  ): OscillatorNode {
    const assets = this.assetsFor(context);
    const curves = this.loopFrom(context, assets.control, note.start);
    const split = context.createChannelSplitter(PLAYER_KEYBOARD_CHOIR_SINGERS.length * 2);
    curves.connect(split);
    const lead = this.singer(context, pitch, split, 0);
    const others = PLAYER_KEYBOARD_CHOIR_SINGERS.slice(1).map((_, index) =>
      this.singer(context, pitch, split, index + 1),
    );
    [lead, ...others].forEach(({ level }) => level.connect(note.envelope));
    const breath = this.loopFrom(context, assets.breath, note.start);
    breath.connect(note.envelope);
    others.forEach(({ oscillator }) => oscillator.start(note.start));
    vibrato.drive(
      lead.oscillator,
      others.map(({ oscillator }) => oscillator.detune),
    );
    const followers = [...others.map(({ oscillator }) => oscillator), curves, breath];
    lead.oscillator.addEventListener('ended', () =>
      followers.forEach((source) => (source.stop(), source.disconnect())),
    );
    return lead.oscillator;
  }

  /**
   * Creates one singer: its oscillator, pitch and loudness taken from its
   * control channels (the pitch once per render quantum, plenty for curves
   * under 8 Hz and far cheaper).
   *
   * @param context Audio context.
   * @param pitch MIDI pitch.
   * @param split Control channels.
   * @param singer Singer index.
   * @returns Unstarted oscillator and its loudness gain.
   */
  private singer(
    context: BaseAudioContext,
    pitch: number,
    split: ChannelSplitterNode,
    singer: number,
  ): { oscillator: OscillatorNode; level: GainNode } {
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(this.waveFor(context, playerKeyboardChoirZone(pitch)));
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    oscillator.detune.automationRate = 'k-rate';
    split.connect(oscillator.detune, singer);
    const level = context.createGain();
    level.gain.value = 0;
    split.connect(level.gain, PLAYER_KEYBOARD_CHOIR_SINGERS.length + singer);
    oscillator.connect(level);
    return { oscillator, level };
  }

  /**
   * Starts a looping buffer at a random point at a time.
   *
   * @param context Audio context.
   * @param buffer Looping buffer.
   * @param start Audio start time.
   * @returns Started source.
   */
  private loopFrom(context: BaseAudioContext, buffer: AudioBuffer, start: number): AudioBufferSourceNode {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(start, Math.random() * buffer.duration);
    return source;
  }

  /**
   * Returns a zone's wave, building it on first use.
   *
   * @param context Audio context.
   * @param zone Zone pitch.
   * @returns Wave.
   */
  private waveFor(context: BaseAudioContext, zone: number): PeriodicWave {
    const waves = this.assetsFor(context).waves;
    const wave = waves.get(zone) ?? playerKeyboardChoirWave(context, zone);
    waves.set(zone, wave);
    return wave;
  }

  /**
   * Returns the context's prepared sound, making it on first use.
   *
   * @param context Audio context.
   * @returns Assets.
   */
  private assetsFor(context: BaseAudioContext): PlayerKeyboardChoirAssets {
    const made = this.assets.get(context);
    if (made) return made;
    const assets = {
      waves: new Map<number, PeriodicWave>(),
      control: playerKeyboardChoirControl(context),
      breath: playerKeyboardChoirBreath(context),
    };
    this.assets.set(context, assets);
    return assets;
  }
}

/** The choir shared by every keyboard, its sound made once per audio context. */
export const playerKeyboardChoir = new PlayerKeyboardChoir();
