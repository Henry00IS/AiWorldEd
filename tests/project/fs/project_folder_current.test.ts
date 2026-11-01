import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectFolderCurrent, projectFolderCurrentSet } from '@/project/fs/project_folder_current.js';

/** The editor-wide record of the open project folder. */
describe('project_folder_current', () => {
  afterEach(() => projectFolderCurrentSet(null));

  it('starts empty, remembers the open folder and forgets it on close', () => {
    expect(projectFolderCurrent()).toBeNull();
    const folder = { name: 'Game' } as unknown as ProjectFileSystem;
    projectFolderCurrentSet(folder);
    expect(projectFolderCurrent()).toBe(folder);
    projectFolderCurrentSet(null);
    expect(projectFolderCurrent()).toBeNull();
  });
});
