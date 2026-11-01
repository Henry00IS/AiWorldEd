import { describe, expect, it } from 'vitest';
import { PROJECT_AUTOSAVE_FORMAT, type ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';
import {
  projectAutosaveNewer,
  projectAutosaveNewest,
  projectAutosaveRead,
} from '@/project/autosave/project_autosave_recovery.js';
import { projectAutosaveProjectCreate } from './project_autosave_test_utils.js';

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
  it('reads the autosave of a scene', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    root.put('.aiworlded/autosave/maps__a.autosave.json', JSON.stringify(documentOf('maps/a.json', 5)));
    expect((await projectAutosaveRead(fileSystem, 'maps/a.json'))?.savedAt).toBe(5);
    expect(await projectAutosaveRead(fileSystem, 'maps/b.json')).toBeNull();
  });

  it('finds the most recently written valid autosave', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    root.put('.aiworlded/autosave/a.autosave.json', JSON.stringify(documentOf('a.json', 1)));
    root.put('.aiworlded/autosave/b.autosave.json', JSON.stringify(documentOf('b.json', 2)));
    root.put('.aiworlded/autosave/broken.autosave.json', '{');
    expect((await projectAutosaveNewest(fileSystem))?.sourcePath).toBe('b.json');
  });

  it('returns null without autosaves', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    expect(await projectAutosaveNewest(fileSystem)).toBeNull();
  });

  it('calls an autosave newer only when clearly after the file', () => {
    expect(projectAutosaveNewer(documentOf(null, 10_000), null)).toBe(true);
    expect(projectAutosaveNewer(documentOf(null, 10_000), 9_500)).toBe(false);
    expect(projectAutosaveNewer(documentOf(null, 10_000), 5_000)).toBe(true);
  });
});
