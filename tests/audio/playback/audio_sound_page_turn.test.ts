import { AudioContextHost } from '@/audio/context/audio_context_host.js';
import { AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AudioSoundPageTurn } from '@/audio/playback/audio_sound_page_turn.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asPlaybackAudioContext,
  createPlaybackTestContext,
  latchPlaybackTestClock,
  stubPlaybackAudioWorklet,
  type PlaybackTestContext,
} from './audio_playback_test_context.js';

describe('AudioSoundPageTurn', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw when AudioContext is unavailable', () => {
    const host = new AudioContextHost(() => null);
    const player = new AudioSoundPageTurn(host, new AudioEffectSoftReverb());
    expect(() => player.play()).not.toThrow();
  });

  it('does not start sources while the running clock stays frozen', () => {
    const { player, context } = createPageTurnPlayer();
    player.play();
    player.play();
    player.play();
    expect(context.bufferSource.start).not.toHaveBeenCalled();
    expect(context.oscillator.start).not.toHaveBeenCalled();
  });

  it('starts one page-turn after the running clock changes', () => {
    const { player, context, host } = createPageTurnPlayer();
    latchPlaybackTestClock(host, context);
    player.play();
    expect(context.bufferSource.start).toHaveBeenCalledTimes(1);
    expect(context.oscillator.start).toHaveBeenCalledTimes(1);
  });
});

/**
 * Builds a page-turn player on a running test context.
 *
 * @returns Player, host, and context.
 */
function createPageTurnPlayer(): {
  player: AudioSoundPageTurn;
  host: AudioContextHost;
  context: PlaybackTestContext;
} {
  stubPlaybackAudioWorklet();
  const context = createPlaybackTestContext('running');
  const host = new AudioContextHost(() => asPlaybackAudioContext(context));
  const player = new AudioSoundPageTurn(host, new AudioEffectSoftReverb());
  return { player, host, context };
}
