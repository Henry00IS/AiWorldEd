import { describe, expect, it } from 'vitest';
import {
  PROJECT_AUTOSAVE_FORMAT,
  projectAutosaveHistoryFolder,
  projectAutosaveHistoryName,
  projectAutosaveHistoryPrune,
  projectAutosaveHistoryTime,
  projectAutosaveKey,
  projectAutosaveParse,
  projectAutosavePath,
} from '@/project/autosave/project_autosave_files.js';

const HOUR = 3_600_000;

describe('project_autosave_files', () => {
  it('derives safe keys and paths from scene paths', () => {
    expect(projectAutosaveKey(null)).toBe('untitled');
    expect(projectAutosaveKey('maps/start.json')).toBe('maps__start');
    expect(projectAutosaveKey('a b/c?d.json')).toBe('a b__c_d');
    expect(projectAutosaveKey(`${'x'.repeat(300)}.json`).length).toBeLessThanOrEqual(120);
    expect(projectAutosavePath('maps__start')).toBe('.aiworlded/autosave/maps__start.autosave.json');
    expect(projectAutosaveHistoryFolder('maps__start')).toBe('.aiworlded/autosave/history/maps__start');
  });

  it('names rotated copies by UTC time and parses them back', () => {
    const time = Date.UTC(2026, 10, 1, 9, 5, 7);
    expect(projectAutosaveHistoryName(time)).toBe('20261101-090507.json');
    expect(projectAutosaveHistoryTime('20261101-090507.json')).toBe(time);
    expect(projectAutosaveHistoryTime('notes.txt')).toBeNull();
  });

  it('keeps the newest ten copies plus one per hour for two days', () => {
    const now = Date.UTC(2026, 10, 3, 12);
    const times = [
      ...Array.from({ length: 15 }, (_, index) => now - index * 60_000),
      now - 5 * HOUR,
      now - 5 * HOUR + 60_000,
      now - 60 * HOUR,
    ];
    const names = times.map(projectAutosaveHistoryName);
    const removed = projectAutosaveHistoryPrune([...names, 'readme.txt'], now);
    expect(removed).toContain(projectAutosaveHistoryName(now - 5 * HOUR));
    expect(removed).toContain(projectAutosaveHistoryName(now - 60 * HOUR));
    expect(removed).not.toContain(projectAutosaveHistoryName(now - 5 * HOUR + 60_000));
    expect(removed).not.toContain('readme.txt');
    expect(names.length - removed.length).toBe(11);
  });

  it('accepts only well-formed autosave documents', () => {
    const valid = { format: PROJECT_AUTOSAVE_FORMAT, savedAt: 1, data: { version: 1, objects: [] } };
    expect(projectAutosaveParse(JSON.stringify(valid))?.savedAt).toBe(1);
    expect(projectAutosaveParse('{"format":"other"}')).toBeNull();
    expect(projectAutosaveParse(JSON.stringify({ ...valid, data: {} }))).toBeNull();
    expect(projectAutosaveParse('not json')).toBeNull();
  });
});
