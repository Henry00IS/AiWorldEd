import { describe, expect, it } from 'vitest';
import {
  PROJECT_AUTOSAVE_FORMAT,
  projectAutosaveKey,
  projectAutosaveParse,
} from '@/project/autosave/project_autosave_files.js';

describe('project_autosave_files', () => {
  it('derives safe keys from scene paths', () => {
    expect(projectAutosaveKey(null)).toBe('untitled');
    expect(projectAutosaveKey('maps/start.json')).toBe('maps__start');
    expect(projectAutosaveKey('maps/start.aiworld')).toBe('maps__start');
    expect(projectAutosaveKey('a b/c?d.json')).toBe('a b__c_d');
    expect(projectAutosaveKey(`${'x'.repeat(300)}.json`).length).toBeLessThanOrEqual(120);
  });

  it('accepts only well-formed saved level states', () => {
    const valid = { format: PROJECT_AUTOSAVE_FORMAT, savedAt: 1, data: { version: 1, objects: [] } };
    expect(projectAutosaveParse(JSON.stringify(valid))?.savedAt).toBe(1);
    expect(projectAutosaveParse('{"format":"other"}')).toBeNull();
    expect(projectAutosaveParse(JSON.stringify({ ...valid, data: {} }))).toBeNull();
    expect(projectAutosaveParse('not json')).toBeNull();
  });
});
