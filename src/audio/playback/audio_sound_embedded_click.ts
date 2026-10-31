import { audioContextHost, type AudioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb, type AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { audioSampleClick001, type AudioSampleClick001 } from '@/audio/sample/audio_sample_click001.js';

/**
 * Plays the embedded click001.wav sample into the soft reverb bus. Used for
 * both selection move (drag) and scale/resize snap feedback.
 */
export class AudioSoundEmbeddedClick {
  private readonly contextHost: AudioContextHost;
  private readonly softReverb: AudioEffectSoftReverb;
  private readonly sample: AudioSampleClick001;
  private readonly playbackGain: number;
  private readonly activeSources: Set<AudioBufferSourceNode>;
  private playGeneration: number;

  /**
   * Creates an embedded-click player.
   *
   * @param contextHost Shared context host for create/unlock/resume.
   * @param softReverb Soft reverb bus for wet/dry output.
   * @param sample Decoded click001 sample cache.
   * @param playbackGain Linear gain applied to each one-shot (0–1).
   */
  constructor(
    contextHost: AudioContextHost = audioContextHost,
    softReverb: AudioEffectSoftReverb = audioEffectSoftReverb,
    sample: AudioSampleClick001 = audioSampleClick001,
    playbackGain = 0.72,
  ) {
    this.contextHost = contextHost;
    this.softReverb = softReverb;
    this.sample = sample;
    this.playbackGain = playbackGain;
    this.activeSources = new Set();
    this.playGeneration = 0;
  }

  /**
   * Ensures the audio context exists and is running. Call from a user gesture
   * so later RAF playback is unlocked.
   */
  unlock(): void {
    this.contextHost.unlock();
    const context = this.contextHost.ensureContext();
    if (context) {
      void this.sample.getDecodedBuffer(context);
    }
  }

  /**
   * Plays one click sample when the context clock has moved. When the context
   * is not running, resumes it and does not start a source.
   *
   * @param playbackRate BufferSource playback rate (1 = default pitch).
   */
  play(playbackRate = 1): void {
    const context = this.contextHost.ensureContext();
    if (!context || !this.contextHost.prepareOneShot(context)) {
      return;
    }
    this.playOnRunningContext(context, playbackRate);
  }

  /**
   * Starts this click request on a running context.
   *
   * @param context Running audio context.
   * @param playbackRate BufferSource playback rate.
   */
  private playOnRunningContext(context: AudioContext, playbackRate: number): void {
    const generation = this.advancePlayGeneration();
    const cached = this.sample.getCachedBuffer(context);
    if (cached) {
      this.scheduleIfCurrent(context, cached, playbackRate, generation);
      return;
    }
    void this.playDecodedIfCurrent(context, playbackRate, generation);
  }

  /**
   * Stores a new play-request token.
   *
   * @returns Token for the request that just started.
   */
  private advancePlayGeneration(): number {
    this.playGeneration += 1;
    return this.playGeneration;
  }

  /**
   * Schedules the buffer when the token is still the stored play-request token.
   *
   * @param context Running audio context.
   * @param buffer Decoded click sample.
   * @param playbackRate BufferSource playback rate.
   * @param generation Token captured when the request started.
   */
  private scheduleIfCurrent(
    context: AudioContext,
    buffer: AudioBuffer,
    playbackRate: number,
    generation: number,
  ): void {
    if (generation !== this.playGeneration) {
      return;
    }
    this.scheduleSample(context, buffer, playbackRate);
  }

  /**
   * Decodes the sample and schedules it when the token is still current.
   *
   * @param context Running audio context.
   * @param playbackRate BufferSource playback rate.
   * @param generation Token captured when the request started.
   */
  private async playDecodedIfCurrent(context: AudioContext, playbackRate: number, generation: number): Promise<void> {
    const decoded = await this.sample.getDecodedBuffer(context);
    if (!decoded || context.state !== 'running') {
      return;
    }
    this.scheduleIfCurrent(context, decoded, playbackRate, generation);
  }

  /**
   * Schedules one buffer playback of the decoded click into the reverb input.
   *
   * @param context Running audio context.
   * @param buffer Decoded click sample.
   * @param playbackRate BufferSource playback rate (pitch / speed).
   */
  private scheduleSample(context: AudioContext, buffer: AudioBuffer, playbackRate: number): void {
    if (!this.contextHost.canScheduleOneShot(context)) {
      return;
    }
    this.startClickSource(context, buffer, playbackRate, context.currentTime);
  }

  /**
   * Starts one click source into the reverb input.
   *
   * @param context Running audio context.
   * @param buffer Decoded click sample.
   * @param playbackRate BufferSource playback rate (pitch / speed).
   * @param now Context time used as the source start time.
   */
  private startClickSource(context: AudioContext, buffer: AudioBuffer, playbackRate: number, now: number): void {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    gain.gain.value = this.playbackGain;
    source.connect(gain);
    gain.connect(this.softReverb.getInput(context));
    this.retainSourceUntilEnded(source);
    source.start(now);
  }

  /**
   * Keeps a playing source referenced until it ends so it is not GC-stopped.
   *
   * @param source One-shot buffer source.
   */
  private retainSourceUntilEnded(source: AudioBufferSourceNode): void {
    this.activeSources.add(source);
    const release = (): void => {
      this.activeSources.delete(source);
    };
    source.onended = release;
  }
}

/** Shared embedded click used for drag move and resize snaps. */
export const audioSoundEmbeddedClick = new AudioSoundEmbeddedClick();
