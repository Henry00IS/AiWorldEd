import { audioContextHost, type AudioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb, type AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';

/**
 * Peak mix level aligned with AudioSoundEmbeddedClick default playbackGain so
 * CSG mode flips sit at the same loudness as snap clicks.
 */
const PAGE_TURN_MATCH_CLICK_GAIN = 0.72;

/** Paper rustle peak relative to the matched click level. */
const PAGE_TURN_PAPER_PEAK = PAGE_TURN_MATCH_CLICK_GAIN * 0.95;

/** Body whoosh peak relative to the matched click level. */
const PAGE_TURN_WHOOSH_PEAK = PAGE_TURN_MATCH_CLICK_GAIN * 0.6;

/**
 * Soft page-turn sound for solid CSG operation changes (additive ↔ subtractive
 * and other operation sets).
 */
export class AudioSoundPageTurn {
  private readonly contextHost: AudioContextHost;
  private readonly softReverb: AudioEffectSoftReverb;

  /**
   * Creates a page-turn player.
   *
   * @param contextHost Shared context host.
   * @param softReverb Soft reverb bus.
   */
  constructor(
    contextHost: AudioContextHost = audioContextHost,
    softReverb: AudioEffectSoftReverb = audioEffectSoftReverb,
  ) {
    this.contextHost = contextHost;
    this.softReverb = softReverb;
  }

  /**
   * Plays one page-turn when the context clock has moved. When the context is
   * not running, resumes it and does not start a source.
   */
  play(): void {
    const context = this.contextHost.ensureContext();
    if (!context || !this.contextHost.prepareOneShot(context)) {
      return;
    }
    this.schedulePageTurnGraph(context);
  }

  /**
   * Schedules a soft paper rustle plus a brief whoosh into the reverb bus.
   *
   * @param context Destination audio context.
   */
  private schedulePageTurnGraph(context: AudioContext): void {
    const now = context.currentTime;
    const output = this.softReverb.getInput(context);
    this.schedulePaperRustle(context, now, output);
    this.scheduleTurnWhoosh(context, now, output);
  }

  /**
   * Soft high bandpassed noise for paper texture.
   *
   * @param context Audio context.
   * @param now Start time.
   * @param output Mix target.
   */
  private schedulePaperRustle(context: AudioContext, now: number, output: AudioNode): void {
    const durationSeconds = 0.14;
    const source = context.createBufferSource();
    source.buffer = this.createPageNoiseBuffer(context, durationSeconds);
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1800, now);
    bandpass.frequency.exponentialRampToValueAtTime(900, now + 0.12);
    bandpass.Q.setValueAtTime(0.7, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(PAGE_TURN_PAPER_PEAK, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(output);
    source.start(now);
    source.stop(now + durationSeconds);
  }

  /**
   * Soft mid whoosh that sells the “turn” motion.
   *
   * @param context Audio context.
   * @param now Start time.
   * @param output Mix target.
   */
  private scheduleTurnWhoosh(context: AudioContext, now: number, output: AudioNode): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const lowpass = context.createBiquadFilter();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(420, now);
    oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.11);
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1400, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(PAGE_TURN_WHOOSH_PEAK, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  }

  /**
   * Builds a short soft noise buffer for paper texture.
   *
   * @param context Audio context.
   * @param durationSeconds Buffer length.
   * @returns Filled buffer.
   */
  private createPageNoiseBuffer(context: AudioContext, durationSeconds: number): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index++) {
      const t = index / frameCount;
      const envelope = Math.sin(Math.PI * t);
      samples[index] = (Math.random() * 2 - 1) * envelope * envelope;
    }
    return buffer;
  }
}

/** Shared page-turn player for CSG operation changes. */
export const audioSoundPageTurn = new AudioSoundPageTurn();
