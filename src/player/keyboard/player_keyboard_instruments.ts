import pianoUrl from '@/audio/raw/keyboard_piano.wav';
import stringsUrl from '@/audio/raw/keyboard_strings.wav';

/** What every slot has: a name, a level and optional envelope changes. */
interface PlayerKeyboardInstrumentBase {
  readonly label: string;
  readonly level: number;
  /** Sustain share of the peak (the default decays to about half). */
  readonly sustain?: number;
  /** Release time constant in seconds (the default fades in about 200 ms). */
  readonly release?: number;
  /** Attack time in seconds (the default is a 5 ms click-free start). */
  readonly attack?: number;
}

/**
 * An instrument slot: a synthesized wave, an additive organ tone, the choir
 * "ahh" (an ensemble of looping glottal-pulse voice waves), a WAV sample
 * pitched from its root note, or a layer of other slots.
 */
export type PlayerKeyboardInstrument = PlayerKeyboardInstrumentBase &
  (
    | { readonly wave: OscillatorType }
    | {
        /** Drawbar levels of the 16', 8', 4', 2 2/3' and 2' sine partials. */
        readonly drawbars: readonly number[];
      }
    | { readonly choir: true }
    | {
        /** Slots played together per note, each at this slot's level share. */
        readonly layers: readonly number[];
      }
    | {
        readonly sampleUrl: string | null;
        readonly rootPitch: number;
        /**
         * Loop in seconds while the note is held; without it the sample plays
         * once.
         */
        readonly loop?: { readonly start: number; readonly end: number };
      }
  );

/**
 * The eight instrument slots. 1-3 are NES-style waves (the square is quieter so
 * levels match); 4 is a drawbar organ held at full level (its level matches its
 * sustained loudness to the waves); 5 is a piano sample (mono WAV recorded at
 * middle C, played once at full level so it decays naturally, its early
 * loudness matched to the waves); 6 is a choir "ahh" of five singers whose
 * voice (an LF glottal pulse through five FOF formants) was fitted to a choir
 * recording within 2.7 dB, with breath, a soft attack and a long release; 7 is
 * a strings sample (mono WAV at middle C) whose whole file (170675 samples at
 * 44.1 kHz) is a seamless loop, faded in and out by the envelope; 8 layers the
 * strings and the piano on every note, each turned down so the pair is no
 * louder than either alone. A sample slot takes its URL (an asset import), the
 * MIDI pitch it was recorded at and optionally a loop in seconds (without one
 * the sample is a one-shot); slots without a sample are skipped when
 * switching.
 */
export const PLAYER_KEYBOARD_INSTRUMENTS: readonly PlayerKeyboardInstrument[] = [
  { label: 'Sine', wave: 'sine', level: 1 },
  { label: 'Square', wave: 'square', level: 0.38 },
  { label: 'Triangle', wave: 'triangle', level: 0.9 },
  { label: 'Organ', drawbars: [0.5, 1, 0.7, 0.45, 0.35], level: 0.78, sustain: 1, release: 0.018 },
  { label: 'Piano', sampleUrl: pianoUrl, rootPitch: 60, level: 1.5, sustain: 1 },
  { label: 'Choir', choir: true, level: 0.6, sustain: 1, attack: 0.12, release: 0.075 },
  {
    label: 'Strings',
    sampleUrl: stringsUrl,
    rootPitch: 60,
    level: 1.6,
    sustain: 1,
    attack: 0.12,
    release: 0.06,
    loop: { start: 0, end: 170675 / 44100 },
  },
  { label: 'Strings + Piano', layers: [6, 4], level: 0.6 },
];

/**
 * Tells whether a slot can sound.
 *
 * @param slot Instrument slot index.
 * @param instruments Slots.
 * @returns True for synthesized slots and filled sample slots.
 */
export function playerKeyboardInstrumentIsPlayable(
  slot: number,
  instruments: readonly PlayerKeyboardInstrument[] = PLAYER_KEYBOARD_INSTRUMENTS,
): boolean {
  const instrument = instruments[slot];
  return instrument !== undefined && (!('sampleUrl' in instrument) || instrument.sampleUrl !== null);
}

/**
 * Steps to the next playable slot, skipping empty ones and wrapping.
 *
 * @param slot Current slot.
 * @param step +1 or -1.
 * @param instruments Slots.
 * @returns Next playable slot (the current one when no other can play).
 */
export function playerKeyboardInstrumentStep(
  slot: number,
  step: number,
  instruments: readonly PlayerKeyboardInstrument[] = PLAYER_KEYBOARD_INSTRUMENTS,
): number {
  const count = instruments.length;
  for (let distance = 1; distance < count; distance++) {
    const next = (((slot + Math.sign(step) * distance) % count) + count) % count;
    if (playerKeyboardInstrumentIsPlayable(next, instruments)) return next;
  }
  return slot;
}
