import type { PlayerViewMode } from '@/player/player_mode.js';

/**
 * Returns the play mode status bar hint for the view and the keyboard. With the
 * keyboard out the letter, digit and bracket keys play notes, so it names the
 * instrument and lists only the controls that are not obvious.
 *
 * @param viewMode Camera view.
 * @param instrument Instrument name while the keyboard is placed, otherwise
 *   null.
 * @param octave Keyboard octave (0 is the lowest).
 * @returns Hint text.
 */
export function playerPlayHint(viewMode: PlayerViewMode, instrument: string | null, octave = 0): string {
  const firstPerson = viewMode === 'first_person';
  const title = `Keyboard: ${instrument}, octave ${octave + 1}`;
  if (instrument !== null && firstPerson)
    return `${title} — LMB put away, ←/→ instrument, ↑/↓ octave, Shift vibrato, wheel pick toy, RMB third-person`;
  if (instrument !== null)
    return `${title} — LMB put away (then 1-5 pick toy), ←/→ instrument, ↑/↓ octave, Shift vibrato, RMB first-person`;
  if (firstPerson) return 'Play mode — ESC exit, LMB throw, 1-5 or wheel pick toy, RMB third-person';
  return 'Third-person — ESC exit, LMB throw, 1-5 pick toy, RMB first-person';
}
