import { textCount } from '@/utils/utils_plural.js';
import type { ProjectHistoryDayGroup } from '@/project/history/core/project_history_entry.js';

/** Tooltip of the star. */
export const DIALOG_PROJECT_HISTORY_STAR_TIP = 'A starred save is never deleted, even years later.';

/** Introduction above the lists. */
export const DIALOG_PROJECT_HISTORY_INTRO =
  'Your level is saved here as you work. Autosaves protect you from a crash; snapshots are kept for 14 days. ' +
  'Star a save to keep it forever.';

/**
 * Words a clock time.
 *
 * @param time Time in milliseconds.
 * @param locale Locale, or undefined for the browser's.
 * @returns Hours and minutes.
 */
export function dialogProjectHistoryClock(time: number, locale?: string): string {
  return new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Words what a day holds ("4 saves · 1 starred").
 *
 * @param group Day.
 * @returns Line.
 */
export function dialogProjectHistoryDayLine(group: ProjectHistoryDayGroup): string {
  const starred = group.entries.filter((entry) => entry.starred).length;
  const saves = textCount(group.entries.length, 'save');
  return starred === 0 ? saves : `${saves} \u00b7 ${starred} starred`;
}
