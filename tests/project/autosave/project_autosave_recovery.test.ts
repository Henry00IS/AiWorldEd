import { describe, expect, it } from 'vitest';
import { PROJECT_AUTOSAVE_FORMAT, type ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';
import {
  projectAutosaveNewer,
  projectAutosaveNewest,
  projectAutosaveRead,
} from '@/project/autosave/project_autosave_recovery.js';
import { projectHistoryMarkerNode } from '@/project/history/store/project_history_recorder.js';
import { projectHistoryLevelStore } from '@/project/history/store/project_history_trees.js';
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
  it('reads the state the work of a level stands at', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    projectHostAutosavePut(root, 'maps/a.json', 5);
    expect((await projectAutosaveRead(fileSystem, 'maps/a.json'))?.savedAt).toBe(5);
    expect(await projectAutosaveRead(fileSystem, 'maps/b.json')).toBeNull();
  });

  it('finds the most recently saved state of all levels', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    projectHostAutosavePut(root, 'a.json', 1_000);
    projectHostAutosavePut(root, 'b.json', 2_000);
    root.put('AiWorldEd/.Local/History/Levels/broken/index.json', '{');
    expect((await projectAutosaveNewest(fileSystem))?.sourcePath).toBe('b.json');
  });

  it('recovers an autosave written by an older version after moving it into its tree', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    root.put('AiWorldEd/.Local/Autosave/maps__a.autosave.json', JSON.stringify(documentOf('maps/a.json', 5)));
    expect((await projectAutosaveRead(fileSystem, 'maps/a.json'))?.savedAt).toBe(5);
    expect(root.handleAt('AiWorldEd/.Local/Autosave/maps__a.autosave.json')).toBeUndefined();
  });

  it('dates a migrated autosave by when it was saved, not by when its file was last touched', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    root.put('AiWorldEd/.Local/Autosave/maps__a.autosave.json', JSON.stringify(documentOf('maps/a.json', 5_000)));
    await projectAutosaveRead(fileSystem, 'maps/a.json');
    const node = await projectHistoryMarkerNode(await projectHistoryLevelStore(fileSystem, 'maps/a.json'));
    expect(node?.time).toBe(5_000);
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
