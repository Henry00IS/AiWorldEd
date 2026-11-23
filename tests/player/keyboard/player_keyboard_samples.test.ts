import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerKeyboardSampleLoad } from '@/player/keyboard/player_keyboard_samples.js';

describe('player keyboard samples', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('decodes a sample once at its recorded rate (not the output rate) and then returns it from the cache', async () => {
    const buffer = { duration: 1 } as AudioBuffer;
    const rates: number[] = [];
    const fetchSample = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal('fetch', fetchSample);
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor(_channels: number, _length: number, rate: number) {
          rates.push(rate);
        }
        decodeAudioData = async () => buffer;
      },
    );
    expect(playerKeyboardSampleLoad('decode-rate.wav')).toBeNull();
    await vi.waitFor(() => expect(playerKeyboardSampleLoad('decode-rate.wav')).toBe(buffer));
    expect(rates).toEqual([44100]);
    expect(fetchSample).toHaveBeenCalledTimes(1);
  });
});
