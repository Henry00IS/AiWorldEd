import { describe, expect, it } from 'vitest';
import { projectHistoryDay, type ProjectHistoryEntry } from '@/project/history/core/project_history_entry.js';
import {
  dialogProjectHistoryClock,
  dialogProjectHistoryDayLine,
} from '@/project/history/ui/dialog_project_history_text.js';

const TIME = new Date(2026, 10, 11, 14, 5).getTime();

/**
 * Builds a save.
 *
 * @param starred Whether it is starred.
 * @returns Save.
 */
function entryOf(starred: boolean): ProjectHistoryEntry {
  return {
    id: 'x',
    day: projectHistoryDay(TIME),
    kind: 'snapshot',
    starred,
    time: TIME,
    source: 'level',
    path: null,
    title: null,
    room: null,
    objectCount: 0,
    thumbnail: false,
  };
}

describe('dialog_project_history_text', () => {
  it('words what a day holds', () => {
    expect(dialogProjectHistoryDayLine({ day: '2026-11-11', entries: [entryOf(false)] })).toBe('1 save');
    expect(dialogProjectHistoryDayLine({ day: '2026-11-11', entries: [entryOf(true), entryOf(false)] })).toBe(
      '2 saves \u00b7 1 starred',
    );
  });

  it('words the time of a save in the locale', () => {
    expect(dialogProjectHistoryClock(TIME, 'de-DE')).toBe('14:05');
  });
});
