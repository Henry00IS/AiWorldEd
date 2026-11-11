import { projectHistoryLevelLabel, type ProjectHistoryEntry } from './project_history_entry.js';

/** Entries of one day. */
export interface ProjectHistoryDay {
  label: string;
  entries: ProjectHistoryEntry[];
}

/** Entries of one level, or the room snapshots, split by day. */
export interface ProjectHistoryGroup {
  /** Level key, or null for the room snapshots. */
  level: string | null;
  label: string;
  /** Whether this is the level open in the editor. */
  current: boolean;
  days: ProjectHistoryDay[];
}

/** Milliseconds in one day. */
const PROJECT_HISTORY_DAY_MS = 86_400_000;

/**
 * Groups entries by level, then by day; the open level comes first, then the
 * groups with the newest entries. Entries keep their newest-first order.
 *
 * @param entries History entries, newest first.
 * @param current Level key of the open level.
 * @param now Current time in milliseconds.
 * @returns Groups.
 */
export function projectHistoryGroups(
  entries: readonly ProjectHistoryEntry[],
  current: string | null,
  now: number,
): ProjectHistoryGroup[] {
  const levels = new Map<string | null, ProjectHistoryEntry[]>();
  entries.forEach((entry) => levels.set(entry.level, [...(levels.get(entry.level) ?? []), entry]));
  const groups = [...levels].map(([level, list]) => ({
    level,
    label: projectHistoryLevelLabel(level),
    current: level !== null && level === current,
    days: projectHistoryDays(list, now),
  }));
  return groups.sort((left, right) => Number(right.current) - Number(left.current));
}

/**
 * Splits entries by local day.
 *
 * @param entries History entries, newest first.
 * @param now Current time in milliseconds.
 * @returns Days, newest first.
 */
function projectHistoryDays(entries: readonly ProjectHistoryEntry[], now: number): ProjectHistoryDay[] {
  const days: ProjectHistoryDay[] = [];
  entries.forEach((entry) => {
    const label = projectHistoryDayLabel(entry.time, now);
    const last = days[days.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  });
  return days;
}

/**
 * Names the local day of a moment: "Today", "Yesterday" or a full date.
 *
 * @param time Moment in milliseconds.
 * @param now Current time in milliseconds.
 * @returns Day label.
 */
export function projectHistoryDayLabel(time: number, now: number): string {
  const day = projectHistoryDayStart(time);
  const today = projectHistoryDayStart(now);
  if (day === today) return 'Today';
  if (Math.round((today - day) / PROJECT_HISTORY_DAY_MS) === 1) return 'Yesterday';
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return new Date(time).toLocaleDateString(undefined, options);
}

/**
 * Returns local midnight of a moment's day.
 *
 * @param time Moment in milliseconds.
 * @returns Local midnight in milliseconds.
 */
function projectHistoryDayStart(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
