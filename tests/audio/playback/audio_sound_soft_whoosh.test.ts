import { AudioContextHost } from '@/audio/context/audio_context_host.js';
import { AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AudioSoundEmbeddedClick } from '@/audio/playback/audio_sound_embedded_click.js';
import { AudioSoundSoftWhoosh } from '@/audio/playback/audio_sound_soft_whoosh.js';
import { AudioSampleClick001 } from '@/audio/sample/audio_sample_click001.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asPlaybackAudioContext,
  createPlaybackTestContext,
  latchPlaybackTestClock,
  stubPlaybackAudioWorklet,
  type PlaybackTestContext,
} from './audio_playback_test_context.js';

describe('AudioSoundSoftWhoosh', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw when AudioContext is unavailable', () => {
    const host = new AudioContextHost(() => null);
    const player = new AudioSoundSoftWhoosh(host, new AudioEffectSoftReverb());
    expect(() => player.play()).not.toThrow();
  });

  it('does not start sources while the running clock stays frozen', () => {
    const { player, context } = createWhooshPlayer(true);
    player.play(1);
    player.play(1.1);
    player.play(1.2);
    expect(context.bufferSource.start).not.toHaveBeenCalled();
  });

  it('schedules the embedded click sample after the running clock changes', async () => {
    const { player, context, host } = createWhooshPlayer(true);
    latchPlaybackTestClock(host, context);
    player.play(1.2);
    await Promise.resolve();
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(context.bufferSource.playbackRate.value).toBe(1.2);
    expect(context.bufferSource.start).toHaveBeenCalledTimes(1);
  });

  it('starts only the newest click when several plays share one decode', async () => {
    const { player, context, host, sample, decoded } = createWhooshPlayer(false);
    latchPlaybackTestClock(host, context);
    const pending = deferDecodedBuffer(sample);
    player.play(1);
    player.play(1.1);
    player.play(1.2);
    pending.resolve(decoded);
    await pending.promise;
    await Promise.resolve();
    expect(context.bufferSource.start).toHaveBeenCalledTimes(1);
    expect(context.bufferSource.playbackRate.value).toBe(1.2);
  });

  it('does not start a decoded click if the clock latch was cleared', async () => {
    const { player, context, host, sample, decoded } = createWhooshPlayer(false);
    latchPlaybackTestClock(host, context);
    const pending = deferDecodedBuffer(sample);
    player.play(1);
    player.play(1.2);
    context.state = 'suspended';
    emitStateChange(context);
    context.state = 'running';
    pending.resolve(decoded);
    await pending.promise;
    await Promise.resolve();
    expect(context.bufferSource.start).not.toHaveBeenCalled();
  });
});

/**
 * Builds a whoosh player over a fresh host and context.
 *
 * @param useCachedBuffer When true, the sample reports a cached buffer.
 * @returns Player, host, context, sample, and decoded buffer.
 */
function createWhooshPlayer(useCachedBuffer: boolean): WhooshPlayerFixture {
  stubPlaybackAudioWorklet();
  const context = createPlaybackTestContext('running');
  const decoded = context.createBuffer();
  const sample = new AudioSampleClick001('data:audio/wav;base64,AA==');
  vi.spyOn(sample, 'getCachedBuffer').mockReturnValue(useCachedBuffer ? decoded : null);
  const host = new AudioContextHost(() => asPlaybackAudioContext(context));
  const reverb = new AudioEffectSoftReverb();
  const embedded = new AudioSoundEmbeddedClick(host, reverb, sample);
  return {
    player: new AudioSoundSoftWhoosh(host, reverb, embedded),
    context,
    host,
    sample,
    decoded,
  };
}

/**
 * Replaces decode with a promise the test resolves later.
 *
 * @param sample Sample whose getDecodedBuffer is replaced.
 * @returns Resolve handle and the pending promise.
 */
function deferDecodedBuffer(sample: AudioSampleClick001): DeferredBuffer {
  let resolveBuffer: (buffer: AudioBuffer) => void = () => undefined;
  const promise = new Promise<AudioBuffer>((resolve) => {
    resolveBuffer = resolve;
  });
  vi.spyOn(sample, 'getDecodedBuffer').mockReturnValue(promise);
  return { promise, resolve: resolveBuffer };
}

/**
 * Runs statechange listeners registered on the test context.
 *
 * @param context Playback test context.
 */
function emitStateChange(context: PlaybackTestContext): void {
  for (const listener of context.stateListeners) {
    listener();
  }
}

/** Whoosh player wired to a test context. */
interface WhooshPlayerFixture {
  player: AudioSoundSoftWhoosh;
  context: PlaybackTestContext;
  host: AudioContextHost;
  sample: AudioSampleClick001;
  decoded: AudioBuffer;
}

/** Decode promise controlled by the test. */
interface DeferredBuffer {
  promise: Promise<AudioBuffer>;
  resolve: (buffer: AudioBuffer) => void;
}
