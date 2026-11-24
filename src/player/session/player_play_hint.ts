import type { PlayerViewMode } from '@/player/player_mode.js';

/**
 * Returns the play mode status bar hint for the view, the keyboard and the
 * grapple beam. With the keyboard out the letter, digit and bracket keys play
 * notes, so it names the instrument and lists only the controls that are not
 * obvious.
 *
 * @param viewMode Camera view.
 * @param instrument Instrument name while the keyboard is placed, otherwise
 *   null.
 * @param octave Keyboard octave (0 is the lowest).
 * @param grapple Whether the grapple beam is picked.
 * @returns Hint text.
 */
export function playerPlayHint(
  viewMode: PlayerViewMode,
  instrument: string | null,
  octave = 0,
  grapple = false,
): string {
  const firstPerson = viewMode === 'first_person';
  const title = `Keyboard: ${instrument}, octave ${octave + 1}`;
  if (instrument !== null && firstPerson)
    return `${title} — LMB put away, ←/→ instrument, ↑/↓ octave, Shift vibrato, wheel pick toy, RMB third-person`;
  if (instrument !== null)
    return `${title} — LMB put away (then 1-6 pick toy), ←/→ instrument, ↑/↓ octave, Shift vibrato, RMB first-person`;
  const action = grapple ? 'hold LMB grapple, let go to fly' : 'LMB throw';
  if (firstPerson) return `Play mode — ESC exit, ${action}, 1-6 or wheel pick toy, RMB third-person`;
  return `Third-person — ESC exit, ${action}, 1-6 pick toy, RMB first-person`;
}
