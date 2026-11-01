import { projectPathName, projectPathParent } from '@/project/fs/project_path.js';
import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { projectSnapshotEmpty, type ProjectSnapshot } from './project_snapshot.js';

/**
 * Builds a project snapshot from texture library entries, so a room member can
 * browse the owner's project (its textures) without a local folder.
 *
 * @param entries Library entries; the built-in checker is skipped.
 * @returns Snapshot of the textures and their folders.
 */
export function projectSnapshotFromEntries(entries: readonly TextureBrowserEntry[]): ProjectSnapshot {
  const snapshot = projectSnapshotEmpty();
  entries.forEach((entry) => {
    if (isDefaultCheckerTextureId(entry.id)) return;
    const directory = projectPathParent(entry.id);
    snapshot.files.set(entry.id, {
      path: entry.id,
      name: projectPathName(entry.id),
      directory,
      kind: 'texture',
      size: entry.byteSize,
      lastModified: entry.sourceFile.lastModified,
    });
    projectSnapshotEntriesFolders(snapshot.directories, directory);
  });
  return snapshot;
}

/**
 * Adds a folder and its parents.
 *
 * @param directories Folder set.
 * @param directory Folder path.
 */
function projectSnapshotEntriesFolders(directories: Set<string>, directory: string): void {
  for (let path = directory; path !== '' && !directories.has(path); path = projectPathParent(path))
    directories.add(path);
}
