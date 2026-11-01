import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';

let projectFolderCurrentValue: ProjectFileSystem | null = null;

/**
 * Records the project folder the editor has open, so features loaded on demand
 * (collaboration room snapshots) can keep files in it.
 *
 * @param fileSystem Open project folder, or null when none is open.
 */
export function projectFolderCurrentSet(fileSystem: ProjectFileSystem | null): void {
  projectFolderCurrentValue = fileSystem;
}

/**
 * Returns the project folder the editor has open.
 *
 * @returns Project folder, or null.
 */
export function projectFolderCurrent(): ProjectFileSystem | null {
  return projectFolderCurrentValue;
}
