import { describe, expect, it } from 'vitest';
import {
  PROJECT_HISTORY_AUTOSAVE_KEEP,
  PROJECT_HISTORY_SNAPSHOT_KEEP_MS,
  projectHistoryDay,
  projectHistoryDayLabel,
  projectHistoryDays,
  projectHistoryEntryName,
  projectHistoryPrune,
  projectHistoryStar,
  type ProjectHistoryEntry,
} from '@/project/history/core/project_history_entry.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 25, 12, 0).getTime();

/**
 * Builds an entry.
 *
 * @param id Id.
 * @param fields Fields to set.
 * @returns Entry.
 */
function entry(id: string, fields: Partial<ProjectHistoryEntry> = {}): ProjectHistoryEntry {
  const time = fields.time ?? NOW;
  return {
    id,
    day: projectHistoryDay(time),
    kind: 'snapshot',
    starred: false,
    time,
    source: 'level',
    path: 'maps/keep.aiworld',
    title: 'keep',
    room: null,
    objectCount: 1,
    thumbnail: false,
    ...fields,
  };
}

describe('projectHistoryPrune', () => {
  it('keeps the newest 4 autosaves of each level and of each room', () => {
    const level = Array.from({ length: 6 }, (_, index) =>
      entry(`l${index}`, { kind: 'autosave', time: NOW - index * 60_000 }),
    );
    const other = Array.from({ length: 5 }, (_, index) =>
      entry(`o${index}`, { kind: 'autosave', path: 'maps/other.aiworld', time: NOW - index * 60_000 }),
    );
    const room = Array.from({ length: 5 }, (_, index) =>
      entry(`r${index}`, { kind: 'autosave', source: 'room', path: null, room: 'Jam', time: NOW - index * 60_000 }),
    );
    const removed = projectHistoryPrune([...level, ...other, ...room], NOW);
    expect(PROJECT_HISTORY_AUTOSAVE_KEEP).toBe(4);
    expect(removed.map((item) => item.id).sort()).toEqual(['l4', 'l5', 'o4', 'r4']);
  });

  it('deletes snapshots after 14 days but never starred ones', () => {
    const fresh = entry('fresh', { time: NOW - 13 * DAY });
    const old = entry('old', { time: NOW - 15 * DAY });
    const starred = entry('starred', { time: NOW - 800 * DAY, starred: true });
    expect(PROJECT_HISTORY_SNAPSHOT_KEEP_MS).toBe(14 * DAY);
    expect(projectHistoryPrune([fresh, old, starred], NOW).map((item) => item.id)).toEqual(['old']);
  });

  it('keeps a day that only has starred saves left, even years later', () => {
    const time = new Date(2026, 10, 11, 9, 30).getTime();
    const entries = [entry('a', { time }), entry('b', { time, starred: true })];
    const later = new Date(2028, 5, 1).getTime();
    const removed = new Set(projectHistoryPrune(entries, later).map((item) => item.id));
    const left = entries.filter((item) => !removed.has(item.id));
    expect(projectHistoryDays(left).map((day) => [day.day, day.entries.map((item) => item.id)])).toEqual([
      ['2026-11-11', ['b']],
    ]);
  });
});

describe('projectHistoryStar', () => {
  it('turns a starred autosave into a snapshot that leaves the autosave rotation', () => {
    const starred = projectHistoryStar(entry('a', { kind: 'autosave' }), true);
    expect(starred).toMatchObject({ kind: 'snapshot', starred: true });
    const autosaves = Array.from({ length: 4 }, (_, index) =>
      entry(`n${index}`, { kind: 'autosave', time: NOW + (index + 1) * 1000 }),
    );
    expect(projectHistoryPrune([starred, ...autosaves], NOW + 5000)).toEqual([]);
    expect(projectHistoryStar(starred, false)).toMatchObject({ kind: 'snapshot', starred: false });
  });
});

describe('projectHistoryDays', () => {
  it('lists days newest first, and in each day the autosaves first, then newest first', () => {
    const today = NOW;
    const yesterday = NOW - DAY;
    const days = projectHistoryDays([
      entry('s1', { time: today - 3000 }),
      entry('a1', { time: today - 5000, kind: 'autosave' }),
      entry('s2', { time: today - 1000 }),
      entry('a2', { time: today - 4000, kind: 'autosave' }),
      entry('y1', { time: yesterday }),
    ]);
    expect(days.map((day) => [day.day, day.entries.map((item) => item.id)])).toEqual([
      [projectHistoryDay(today), ['a2', 'a1', 's2', 's1']],
      [projectHistoryDay(yesterday), ['y1']],
    ]);
  });

  it('labels a day with the locale date, day month year', () => {
    const day = projectHistoryDay(new Date(2026, 10, 11, 23, 30).getTime());
    expect(day).toBe('2026-11-11');
    expect(projectHistoryDayLabel(day, 'de-DE')).toBe('11.11.2026');
    expect(projectHistoryDayLabel('2026-03-04', 'en-GB')).toBe('04/03/2026');
  });
});

describe('projectHistoryEntryName', () => {
  it('names a save after its level file, an unsaved level or a room', () => {
    expect(projectHistoryEntryName(entry('a'))).toBe('keep');
    expect(projectHistoryEntryName(entry('b', { title: null, path: null }))).toBe('Unsaved Level');
    expect(projectHistoryEntryName(entry('c', { source: 'room', room: 'Jam', title: null }))).toBe(
      'Collaborative Room',
    );
  });
});
