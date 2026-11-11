import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectHistoryMarkerNode } from '@/project/history/store/project_history_recorder.js';
import type { ProjectHistoryStore } from '@/project/history/store/project_history_store.js';
import { projectHistoryLevelStore, projectHistoryStoresList } from '@/project/history/store/project_history_trees.js';
import { projectAutosaveParse, type ProjectAutosaveDocument } from './project_autosave_files.js';

/**
 * Reads the state one level's work last stood at: the marker of its history.
 *
 * @param fileSystem Project file system.
 * @param sourcePath Scene path in the project, or null when untitled.
 * @returns Saved state, or null when none or invalid.
 */
export async function projectAutosaveRead(
  fileSystem: ProjectFileSystem,
  sourcePath: string | null,
): Promise<ProjectAutosaveDocument | null> {
  return projectAutosaveMarkerRead(await projectHistoryLevelStore(fileSystem, sourcePath));
}

/**
 * Finds the level whose work was saved most recently and reads the state it
 * stood at.
 *
 * @param fileSystem Project file system.
 * @returns Newest valid saved state, or null.
 */
export async function projectAutosaveNewest(fileSystem: ProjectFileSystem): Promise<ProjectAutosaveDocument | null> {
  const stores = (await projectHistoryStoresList(fileSystem)).filter((store) => store.kind === 'level');
  const markers = await Promise.all(
    stores.map(async (store) => ({ store, node: await projectHistoryMarkerNode(store).catch(() => null) })),
  );
  const newest = markers
    .filter((entry) => entry.node !== null)
    .sort((left, right) => (right.node?.time ?? 0) - (left.node?.time ?? 0));
  for (const entry of newest) {
    const document = await projectAutosaveMarkerRead(entry.store);
    if (document !== null) return document;
  }
  return null;
}

/**
 * Reads the marker state of a level tree.
 *
 * @param store Level tree.
 * @returns Saved state, or null.
 */
async function projectAutosaveMarkerRead(store: ProjectHistoryStore): Promise<ProjectAutosaveDocument | null> {
  const node = await projectHistoryMarkerNode(store).catch(() => null);
  const file = node === null ? null : await store.stateRead(node.id);
  return file === null ? null : projectAutosaveParse(await file.text());
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
