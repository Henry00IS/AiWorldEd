import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import type { ProjectHistoryEntry } from '@/project/history/core/project_history_entry.js';
import { projectHistoryStoreFor } from '@/project/history/core/project_history_store.js';
import { projectAutosaveParse, type ProjectAutosaveDocument } from './project_autosave_files.js';

/**
 * Reads the newest save of one level.
 *
 * @param fileSystem Project file system.
 * @param sourcePath Scene path in the project, or null when untitled.
 * @returns Saved state, or null when none or invalid.
 */
export async function projectAutosaveRead(
  fileSystem: ProjectFileSystem,
  sourcePath: string | null,
): Promise<ProjectAutosaveDocument | null> {
  return projectAutosaveNewestOf(fileSystem, (entry) => entry.path === sourcePath);
}

/**
 * Reads the newest save of any level.
 *
 * @param fileSystem Project file system.
 * @returns Newest valid saved state, or null.
 */
export async function projectAutosaveNewest(fileSystem: ProjectFileSystem): Promise<ProjectAutosaveDocument | null> {
  return projectAutosaveNewestOf(fileSystem, () => true);
}

/**
 * Reads the newest valid level save that matches.
 *
 * @param fileSystem Project file system.
 * @param match Tells which level saves count.
 * @returns Saved state, or null.
 */
async function projectAutosaveNewestOf(
  fileSystem: ProjectFileSystem,
  match: (entry: ProjectHistoryEntry) => boolean,
): Promise<ProjectAutosaveDocument | null> {
  const store = projectHistoryStoreFor(fileSystem);
  const entries = (await store.entries().catch(() => []))
    .filter((entry) => entry.source === 'level' && match(entry))
    .sort((left, right) => right.time - left.time);
  for (const entry of entries) {
    const file = await store.stateRead(entry);
    const document = file === null ? null : projectAutosaveParse(await file.text());
    if (document !== null) return document;
  }
  return null;
}

/**
 * Tells whether an autosave holds work newer than the scene file on disk.
 *
 * @param document Autosave.
 * @param sceneModified Scene file modification time, or null when untitled.
 * @returns True when recovery should be offered.
 */
export function projectAutosaveNewer(document: ProjectAutosaveDocument, sceneModified: number | null): boolean {
  return sceneModified === null || document.savedAt > sceneModified + 1000;
}
