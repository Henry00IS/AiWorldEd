/**
 * Freeverb reverb model tuning values (Jezar / Dreampoint, public domain).
 * Delay lengths are defined at 44.1 kHz and scaled for the live sample rate.
 */

/** Sample rate the comb/allpass tables were tuned for. */
export const FREEVERB_TUNING_SAMPLE_RATE = 44100;

/** Number of parallel comb filters per channel. */
export const FREEVERB_NUM_COMBS = 8;

/** Number of series allpass filters per channel. */
export const FREEVERB_NUM_ALLPASSES = 4;

/** Gain applied when freeze mode mutes the input. */
export const FREEVERB_MUTED = 0;

/** Fixed input gain into the comb network. */
export const FREEVERB_FIXED_GAIN = 0.015;

/** Scales the public wet parameter into the internal wet gain. */
export const FREEVERB_SCALE_WET = 3;

/** Scales the public dry parameter into the internal dry gain. */
export const FREEVERB_SCALE_DRY = 2;

/** Scales the public damp parameter into the comb one-pole damp. */
export const FREEVERB_SCALE_DAMP = 0.4;

/** Scales the public room-size parameter into comb feedback. */
export const FREEVERB_SCALE_ROOM = 0.28;

/** Added to the scaled room-size parameter for comb feedback. */
export const FREEVERB_OFFSET_ROOM = 0.7;

/** Default public room-size parameter. */
export const FREEVERB_INITIAL_ROOM = 0.5;

/** Default public damp parameter. */
export const FREEVERB_INITIAL_DAMP = 0.5;

/** Default public wet parameter. */
export const FREEVERB_INITIAL_WET = 1 / FREEVERB_SCALE_WET;

/** Default public dry parameter. */
export const FREEVERB_INITIAL_DRY = 0;

/** Default stereo width parameter. */
export const FREEVERB_INITIAL_WIDTH = 1;

/** Default freeze-mode parameter. */
export const FREEVERB_INITIAL_MODE = 0;

/** Mode values at or above this enable freeze. */
export const FREEVERB_FREEZE_MODE = 0.5;

/** Extra samples added to every right-channel delay line. */
export const FREEVERB_STEREO_SPREAD = 23;

/** Left comb delay lengths in samples at 44.1 kHz. */
export const FREEVERB_COMB_TUNING_L: readonly number[] = Object.freeze([
  1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617,
]);

/** Right comb delay lengths in samples at 44.1 kHz. */
export const FREEVERB_COMB_TUNING_R: readonly number[] = Object.freeze([
  1116 + FREEVERB_STEREO_SPREAD,
  1188 + FREEVERB_STEREO_SPREAD,
  1277 + FREEVERB_STEREO_SPREAD,
  1356 + FREEVERB_STEREO_SPREAD,
  1422 + FREEVERB_STEREO_SPREAD,
  1491 + FREEVERB_STEREO_SPREAD,
  1557 + FREEVERB_STEREO_SPREAD,
  1617 + FREEVERB_STEREO_SPREAD,
]);

/** Left allpass delay lengths in samples at 44.1 kHz. */
export const FREEVERB_ALLPASS_TUNING_L: readonly number[] = Object.freeze([556, 441, 341, 225]);

/** Right allpass delay lengths in samples at 44.1 kHz. */
export const FREEVERB_ALLPASS_TUNING_R: readonly number[] = Object.freeze([
  556 + FREEVERB_STEREO_SPREAD,
  441 + FREEVERB_STEREO_SPREAD,
  341 + FREEVERB_STEREO_SPREAD,
  225 + FREEVERB_STEREO_SPREAD,
]);

/** Fixed allpass feedback coefficient. */
export const FREEVERB_ALLPASS_FEEDBACK = 0.5;

/**
 * Scales a Freeverb 44.1 kHz delay length to the live sample rate.
 *
 * @param samplesAt44100 Delay length from the Freeverb tuning tables.
 * @param sampleRate Live audio sample rate in Hz.
 * @returns Delay length in samples at sampleRate (at least 1).
 */
export function scaleFreeverbTuningSamples(samplesAt44100: number, sampleRate: number): number {
  if (sampleRate <= 0) {
    return Math.max(1, samplesAt44100);
  }
  const scaled = Math.round((samplesAt44100 * sampleRate) / FREEVERB_TUNING_SAMPLE_RATE);
  if (scaled < 1) {
    return 1;
  }
  return scaled;
}

/**
 * Scales every entry of a Freeverb tuning table to the live sample rate.
 *
 * @param tunings Delay lengths at 44.1 kHz.
 * @param sampleRate Live audio sample rate in Hz.
 * @returns New array of scaled sample lengths.
 */
export function scaleFreeverbTuningTable(tunings: readonly number[], sampleRate: number): number[] {
  const scaled: number[] = [];
  for (let index = 0; index < tunings.length; index++) {
    scaled.push(scaleFreeverbTuningSamples(tunings[index]!, sampleRate));
  }
  return scaled;
}
