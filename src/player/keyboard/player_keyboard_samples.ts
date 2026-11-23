/** Decoded samples per URL. */
const playerKeyboardSamples = new Map<string, AudioBuffer | null>();

/**
 * Rate the sample files are recorded at; they are decoded at it (not the output
 * rate) so a whole-file loop stays seamless, as decode-time resampling smears
 * the file edges and clicks at the seam.
 */
const PLAYER_KEYBOARD_SAMPLE_HZ = 44100;

/**
 * Returns a decoded sample, starting its download and decode on first use.
 *
 * @param url Sample URL.
 * @returns Buffer, or null until it is ready (or when it failed).
 */
export function playerKeyboardSampleLoad(url: string): AudioBuffer | null {
  if (playerKeyboardSamples.has(url)) return playerKeyboardSamples.get(url) ?? null;
  playerKeyboardSamples.set(url, null);
  void fetch(url)
    .then((response) => response.arrayBuffer())
    .then((bytes) => new OfflineAudioContext(1, 1, PLAYER_KEYBOARD_SAMPLE_HZ).decodeAudioData(bytes))
    .then((buffer) => playerKeyboardSamples.set(url, buffer))
    .catch(() => playerKeyboardSamples.set(url, null));
  return null;
}
