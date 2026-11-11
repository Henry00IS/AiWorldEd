import { describe, expect, it } from 'vitest';
import type { ProjectHistoryEntry } from '@/project/history/project_history_entry.js';
import { projectHistoryDayLabel, projectHistoryGroups } from '@/project/history/project_history_group.js';
import { projectHistoryKindLabel, projectHistoryLevelLabel } from '@/project/history/project_history_entry.js';

const NOW = new Date(2026, 10, 11, 12).getTime();

/**
 * Builds an entry.
 *
 * @param level Level key.
 * @param time Entry time.
 * @returns Entry.
 */
function entryOf(level: string | null, time: number): ProjectHistoryEntry {
  const kind = level === null ? 'room' : 'autosave';
  return {
    id: `${level}-${time}`,
    path: 'p',
    kind,
    level,
    time,
    locked: false,
    size: 1,
    objectCount: null,
    reason: null,
    snapshotId: null,
  };
}

describe('projectHistoryGroups', () => {
  it('groups by level with the open level first, then by day', () => {
    const entries = [
      entryOf('castle', NOW - 1000),
      entryOf(null, NOW - 2000),
      entryOf('maps__start', NOW - 3000),
      entryOf('maps__start', NOW - 26 * 3_600_000),
    ];
    const groups = projectHistoryGroups(entries, 'maps__start', NOW);
    expect(groups.map((group) => group.label)).toEqual(['maps/start', 'castle', 'Room Snapshots']);
    expect(groups[0]?.current).toBe(true);
    expect(groups[0]?.days.map((day) => day.label)).toEqual(['Today', 'Yesterday']);
  });

  it('names days and kinds', () => {
    expect(projectHistoryDayLabel(NOW - 3_600_000, NOW)).toBe('Today');
    expect(projectHistoryDayLabel(new Date(2026, 10, 10, 23).getTime(), NOW)).toBe('Yesterday');
    expect(projectHistoryDayLabel(new Date(2026, 10, 1).getTime(), NOW)).toContain('2026');
    expect(projectHistoryLevelLabel('untitled')).toBe('Untitled Level');
    expect(projectHistoryKindLabel({ ...entryOf(null, 0), reason: 'large-change' })).toBe('Before Large Change');
    expect(projectHistoryKindLabel({ ...entryOf('a', 0), kind: 'restore' })).toBe('Before Restore');
  });
});
