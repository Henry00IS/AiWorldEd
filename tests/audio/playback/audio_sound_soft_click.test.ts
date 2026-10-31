import { AudioContextHost } from '@/audio/context/audio_context_host.js';
import { AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AudioSoundEmbeddedClick } from '@/audio/playback/audio_sound_embedded_click.js';
import { AudioSoundSoftClick } from '@/audio/playback/audio_sound_soft_click.js';
import { AudioSampleClick001 } from '@/audio/sample/audio_sample_click001.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asPlaybackAudioContext,
  createPlaybackTestContext,
  latchPlaybackTestClock,
  stubPlaybackAudioWorklet,
} from './audio_playback_test_context.js';

describe('AudioSoundSoftClick', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw when AudioContext is unavailable', () => {
    const host = new AudioContextHost(() => null);
    const player = new AudioSoundSoftClick(host, new AudioEffectSoftReverb());
    expect(() => player.play()).not.toThrow();
    expect(() => player.unlock()).not.toThrow();
  });

  it('does not start sources while the running clock stays frozen', () => {
    const { player, context } = createClickPlayer();
    player.play();
    player.play();
    expect(context.bufferSource.start).not.toHaveBeenCalled();
  });

  it('schedules the embedded click sample into the reverb input', async () => {
    const { player, context, host } = createClickPlayer();
    latchPlaybackTestClock(host, context);
    player.play();
    await Promise.resolve();
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(context.createGain).toHaveBeenCalled();
    expect(context.bufferSource.start).toHaveBeenCalledTimes(1);
  });
});

/**
 * Builds a soft-click player with a cached embedded sample.
 *
 * @returns Player, host, and context.
 */
function createClickPlayer(): {
  player: AudioSoundSoftClick;
  host: AudioContextHost;
  context: ReturnType<typeof createPlaybackTestContext>;
} {
  stubPlaybackAudioWorklet();
  const context = createPlaybackTestContext('running');
  const decoded = context.createBuffer();
  const sample = new AudioSampleClick001('data:audio/wav;base64,AA==');
  vi.spyOn(sample, 'getDecodedBuffer').mockResolvedValue(decoded);
  vi.spyOn(sample, 'getCachedBuffer').mockReturnValue(decoded);
  const host = new AudioContextHost(() => asPlaybackAudioContext(context));
  const reverb = new AudioEffectSoftReverb();
  const embedded = new AudioSoundEmbeddedClick(host, reverb, sample);
  const player = new AudioSoundSoftClick(host, reverb, embedded);
  return { player, host, context };
}
