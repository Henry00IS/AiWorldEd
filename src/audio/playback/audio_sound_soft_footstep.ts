import { audioContextHost, type AudioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb, type AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';

/** Peak level for the low body impact of a foot plant. */
const FOOTSTEP_THUMP_PEAK = 1.15;

/** Peak level for the brief surface scuff layer. */
const FOOTSTEP_SCUFF_PEAK = 0.85;

/**
 * Play-mode foot plant: layered low thump + short scuff into the soft reverb
 * bus (same wet/dry routing as other editor SFX, different sound character).
 */
export class AudioSoundSoftFootstep {
  private readonly contextHost: AudioContextHost;
  private readonly softReverb: AudioEffectSoftReverb;

  /**
   * Creates a procedural footstep player.
   *
   * @param contextHost Shared context host for create/unlock/resume.
   * @param softReverb Soft reverb bus for wet/dry output.
   */
  constructor(
    contextHost: AudioContextHost = audioContextHost,
    softReverb: AudioEffectSoftReverb = audioEffectSoftReverb,
  ) {
    this.contextHost = contextHost;
    this.softReverb = softReverb;
  }

  /**
   * Ensures the audio context exists and is running. Call from a user gesture
   * so later RAF playback is unlocked.
   */
  unlock(): void {
    this.contextHost.unlock();
  }

  /**
   * Plays one foot plant when the context clock has moved. When the context is
   * not running, resumes it and does not start a source.
   *
   * @param playbackRate Pitch scale (1 = default; higher = faster/lighter
   *   step).
   */
  play(playbackRate = 1): void {
    const context = this.contextHost.ensureContext();
    if (!context || !this.contextHost.prepareOneShot(context)) {
      return;
    }
    this.scheduleFootstepGraph(context, clampFootstepPlaybackRate(playbackRate));
  }

  /**
   * Schedules thump and scuff layers into the reverb input.
   *
   * @param context Running audio context.
   * @param playbackRate Pitch scale.
   */
  private scheduleFootstepGraph(context: AudioContext, playbackRate: number): void {
    const now = context.currentTime;
    const output = this.softReverb.getInput(context);
    this.scheduleBodyThump(context, now, output, playbackRate);
    this.scheduleSurfaceScuff(context, now, output, playbackRate);
  }

  /**
   * Soft low impact that sells boot weight on the floor.
   *
   * @param context Audio context.
   * @param now Start time.
   * @param output Mix target.
   * @param playbackRate Pitch scale.
   */
  private scheduleBodyThump(context: AudioContext, now: number, output: AudioNode, playbackRate: number): void {
    const durationSeconds = 0.11 / playbackRate;
    const source = context.createBufferSource();
    source.buffer = this.createNoiseBuffer(context, durationSeconds);
    source.playbackRate.value = playbackRate;
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(380 * playbackRate, now);
    lowpass.frequency.exponentialRampToValueAtTime(140 * playbackRate, now + durationSeconds * 0.85);
    lowpass.Q.setValueAtTime(0.55, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(FOOTSTEP_THUMP_PEAK, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(output);
    source.start(now);
    source.stop(now + durationSeconds + 0.02);
  }

  /**
   * Brief mid scuff so the plant is not only a dull thump.
   *
   * @param context Audio context.
   * @param now Start time.
   * @param output Mix target.
   * @param playbackRate Pitch scale.
   */
  private scheduleSurfaceScuff(context: AudioContext, now: number, output: AudioNode, playbackRate: number): void {
    const durationSeconds = 0.07 / playbackRate;
    const source = context.createBufferSource();
    source.buffer = this.createNoiseBuffer(context, durationSeconds);
    source.playbackRate.value = playbackRate;
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(900 * playbackRate, now);
    bandpass.frequency.exponentialRampToValueAtTime(380 * playbackRate, now + durationSeconds * 0.9);
    bandpass.Q.setValueAtTime(0.7, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(FOOTSTEP_SCUFF_PEAK, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(output);
    source.start(now);
    source.stop(now + durationSeconds + 0.02);
  }

  /**
   * Builds a short mono noise buffer with a raised-cosine envelope.
   *
   * @param context Audio context.
   * @param durationSeconds Buffer length.
   * @returns Filled noise buffer.
   */
  private createNoiseBuffer(context: AudioContext, durationSeconds: number): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index++) {
      const t = index / frameCount;
      const envelope = Math.sin(Math.PI * Math.min(1, t * 1.15));
      samples[index] = (Math.random() * 2 - 1) * envelope * envelope;
    }
    return buffer;
  }
}

/**
 * Clamps footstep playback rate into a stable pitch band.
 *
 * @param playbackRate Requested rate.
 * @returns Clamped rate.
 */
function clampFootstepPlaybackRate(playbackRate: number): number {
  if (playbackRate < 0.65) {
    return 0.65;
  }
  if (playbackRate > 1.35) {
    return 1.35;
  }
  return playbackRate;
}

/** Shared soft-footstep player for play-mode locomotion. */
export const audioSoundSoftFootstep = new AudioSoundSoftFootstep();
