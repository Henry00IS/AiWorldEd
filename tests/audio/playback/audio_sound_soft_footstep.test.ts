import { AudioContextHost } from '@/audio/context/audio_context_host.js';
import { AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AudioSoundSoftFootstep } from '@/audio/playback/audio_sound_soft_footstep.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asPlaybackAudioContext,
  createPlaybackTestContext,
  latchPlaybackTestClock,
  stubPlaybackAudioWorklet,
  type PlaybackTestContext,
} from './audio_playback_test_context.js';

describe('AudioSoundSoftFootstep', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw when AudioContext is unavailable', () => {
    const host = new AudioContextHost(() => null);
    const player = new AudioSoundSoftFootstep(host, new AudioEffectSoftReverb());
    expect(() => player.play()).not.toThrow();
  });

  it('does not start sources while the running clock stays frozen', () => {
    const { player, context } = createFootstepPlayer();
    player.play(1);
    player.play(1.1);
    player.play(0.9);
    expect(context.bufferSource.start).not.toHaveBeenCalled();
  });

  it('starts thump and scuff after the running clock changes', () => {
    const { player, context, host } = createFootstepPlayer();
    latchPlaybackTestClock(host, context);
    player.play(1);
    expect(context.bufferSource.start).toHaveBeenCalledTimes(2);
  });
});

/**
 * Builds a footstep player on a running test context.
 *
 * @returns Player, host, and context.
 */
function createFootstepPlayer(): {
  player: AudioSoundSoftFootstep;
  host: AudioContextHost;
  context: PlaybackTestContext;
} {
  stubPlaybackAudioWorklet();
  const context = createPlaybackTestContext('running');
  const host = new AudioContextHost(() => asPlaybackAudioContext(context));
  const player = new AudioSoundSoftFootstep(host, new AudioEffectSoftReverb());
  return { player, host, context };
}
