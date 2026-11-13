import { describe, expect, it } from 'vitest';
import { PROJECT_AUTOSAVE_FORMAT, type ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';
import {
  projectAutosaveNewer,
  projectAutosaveNewest,
  projectAutosaveRead,
} from '@/project/autosave/project_autosave_recovery.js';
import { projectAutosaveProjectCreate } from './project_autosave_test_utils.js';
import { projectHostAutosavePut } from '../host/project_host_test_utils.js';

/**
 * Builds an autosave document.
 *
 * @param sourcePath Scene path.
 * @param savedAt Save time.
 * @returns Document.
 */
function documentOf(sourcePath: string | null, savedAt: number): ProjectAutosaveDocument {
  return {
    format: PROJECT_AUTOSAVE_FORMAT,
    version: 1,
    scene: 'x',
    sourcePath,
    savedAt,
    objectCount: 0,
    data: { version: 1, objects: [] } as never,
  };
}

describe('project_autosave_recovery', () => {
  it('reads the newest save of a level', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    await projectHostAutosavePut(root, 'maps/a.json', 3);
    await projectHostAutosavePut(root, 'maps/a.json', 5);
    await projectHostAutosavePut(root, null, 7);
    expect((await projectAutosaveRead(fileSystem, 'maps/a.json'))?.savedAt).toBe(5);
    expect(await projectAutosaveRead(fileSystem, 'maps/b.json')).toBeNull();
  });

  it('finds the newest save of all levels and skips a broken state', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    await projectHostAutosavePut(root, 'a.json', 1_000);
    await projectHostAutosavePut(root, 'b.json', 2_000);
    root.put(await projectHostAutosavePut(root, 'c.json', 3_000), '{');
    expect((await projectAutosaveNewest(fileSystem))?.sourcePath).toBe('b.json');
  });

  it('returns null without saved states', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    expect(await projectAutosaveNewest(fileSystem)).toBeNull();
  });

  it('calls an autosave newer only when clearly after the file', () => {
    expect(projectAutosaveNewer(documentOf(null, 10_000), null)).toBe(true);
    expect(projectAutosaveNewer(documentOf(null, 10_000), 9_500)).toBe(false);
    expect(projectAutosaveNewer(documentOf(null, 10_000), 5_000)).toBe(true);
  });
});
