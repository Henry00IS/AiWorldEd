import { describe, expect, it } from 'vitest';
import {
  PROJECT_AUTOSAVE_FORMAT,
  projectAutosaveHistoryFolder,
  projectAutosaveHistoryName,
  projectAutosaveHistoryPrune,
  projectAutosaveHistoryParse,
  projectAutosaveKey,
  projectAutosaveParse,
  projectAutosavePath,
} from '@/project/autosave/project_autosave_files.js';

const HOUR = 3_600_000;

describe('project_autosave_files', () => {
  it('derives safe keys and paths from scene paths', () => {
    expect(projectAutosaveKey(null)).toBe('untitled');
    expect(projectAutosaveKey('maps/start.json')).toBe('maps__start');
    expect(projectAutosaveKey('maps/start.aiworld')).toBe('maps__start');
    expect(projectAutosaveKey('a b/c?d.json')).toBe('a b__c_d');
    expect(projectAutosaveKey(`${'x'.repeat(300)}.json`).length).toBeLessThanOrEqual(120);
    expect(projectAutosavePath('maps__start')).toBe('AiWorldEd/.Local/Autosave/maps__start.autosave.json');
    expect(projectAutosaveHistoryFolder('maps__start')).toBe('AiWorldEd/.Local/Autosave/History/maps__start');
  });

  it('names rotated copies by UTC time and parses them back', () => {
    const time = Date.UTC(2026, 10, 1, 9, 5, 7);
    expect(projectAutosaveHistoryName(time)).toBe('20261101-090507.json');
    expect(projectAutosaveHistoryParse('20261101-090507.json')).toEqual({ time, kind: 'autosave', locked: false });
    expect(projectAutosaveHistoryParse('20261101-090507.aiworld')).toBeNull();
    expect(projectAutosaveHistoryParse('notes.txt')).toBeNull();
  });

  it('marks snapshots, copies kept before a restore and locked copies in the name', () => {
    const time = Date.UTC(2026, 10, 1, 9, 5, 7);
    expect(projectAutosaveHistoryName(time, 'snapshot', true)).toBe('20261101-090507.snapshot.locked.json');
    expect(projectAutosaveHistoryName(time, 'restore')).toBe('20261101-090507.restore.json');
    expect(projectAutosaveHistoryName(time, 'autosave', true)).toBe('20261101-090507.locked.json');
    for (const kind of ['autosave', 'snapshot', 'restore'] as const)
      for (const locked of [false, true])
        expect(projectAutosaveHistoryParse(projectAutosaveHistoryName(time, kind, locked))).toEqual({
          time,
          kind,
          locked,
        });
    expect(projectAutosaveHistoryParse('20261101-090507.other.json')).toBeNull();
  });

  it('never deletes locked copies, however old', () => {
    const now = Date.UTC(2026, 10, 30, 12);
    const old = Array.from({ length: 30 }, (_, index) => now - (100 + index) * HOUR);
    const locked = old.map((time) => projectAutosaveHistoryName(time, 'autosave', true));
    const lockedByHand = old.map((time) => projectAutosaveHistoryName(time, 'snapshot', true));
    const fresh = Array.from({ length: 30 }, (_, index) => projectAutosaveHistoryName(now - index * 60_000));
    const removed = projectAutosaveHistoryPrune([...locked, ...lockedByHand, ...fresh], now);
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.filter((name) => locked.includes(name) || lockedByHand.includes(name))).toEqual([]);
  });

  it('keeps unlocked snapshots and pre-restore copies for 48 hours, not just the newest per hour', () => {
    const now = Date.UTC(2026, 10, 3, 12);
    const keptBefore = projectAutosaveHistoryName(now - 20 * 60_000, 'restore');
    const snapshot = projectAutosaveHistoryName(now - 47 * HOUR, 'snapshot');
    const expired = projectAutosaveHistoryName(now - 49 * HOUR, 'snapshot');
    const automatic = Array.from({ length: 12 }, (_, index) => projectAutosaveHistoryName(now - index * 2 * 60_000));
    const removed = projectAutosaveHistoryPrune([keptBefore, snapshot, expired, ...automatic], now);
    expect(removed).toContain(expired);
    expect(removed).not.toContain(keptBefore);
    expect(removed).not.toContain(snapshot);
  });

  it('keeps the newest ten copies plus one per hour for two days', () => {
    const now = Date.UTC(2026, 10, 3, 12);
    const times = [
      ...Array.from({ length: 15 }, (_, index) => now - index * 60_000),
      now - 5 * HOUR,
      now - 5 * HOUR + 60_000,
      now - 60 * HOUR,
    ];
    const names = times.map((time) => projectAutosaveHistoryName(time));
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
