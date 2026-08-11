/** First-person versus third-person camera mode while playing. */
export type PlayerViewMode = 'first_person' | 'third_person';

/**
 * Returns the opposite camera mode.
 *
 * @param mode Current view mode.
 * @returns Toggled mode.
 */
export function playerViewModeToggle(mode: PlayerViewMode): PlayerViewMode {
  if (mode === 'first_person') {
    return 'third_person';
  }
  return 'first_person';
}
