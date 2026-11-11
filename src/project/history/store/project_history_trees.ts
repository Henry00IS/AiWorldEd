import { projectAutosaveKey } from '@/project/autosave/project_autosave_files.js';
import { PROJECT_EDITOR_HISTORY_DIRECTORY } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectPathJoin } from '@/project/fs/project_path.js';
import type { ProjectHistoryTreeKind } from '@/project/history/tree/project_history_tree.js';
import { ProjectHistoryFolderMemory, ProjectHistoryFolderProject } from './project_history_folder.js';
import { projectHistoryLevelLabel, projectHistoryRoomKey } from './project_history_keys.js';
import { projectHistoryMigrate } from './project_history_migrate.js';
import { ProjectHistoryStore } from './project_history_store.js';

/** Folders of the level trees and of the room trees. */
export const PROJECT_HISTORY_TREE_DIRECTORIES: Readonly<Record<ProjectHistoryTreeKind, string>> = {
  level: `${PROJECT_EDITOR_HISTORY_DIRECTORY}/Levels`,
  room: `${PROJECT_EDITOR_HISTORY_DIRECTORY}/Rooms`,
};

/** Stores of each project folder, so every user of a tree shares its index. */
const projectHistoryStores = new WeakMap<ProjectFileSystem, Map<string, ProjectHistoryStore>>();

/**
 * Returns the project-relative folder of a tree.
 *
 * @param kind What the tree keeps.
 * @param key Tree key.
 * @returns Folder path.
 */
export function projectHistoryTreeFolder(kind: ProjectHistoryTreeKind, key: string): string {
  return projectPathJoin(PROJECT_HISTORY_TREE_DIRECTORIES[kind], key);
}

/**
 * Returns the shared store of a tree in a project folder, after older autosave
 * and snapshot files were moved into trees.
 *
 * @param fileSystem Project folder.
 * @param kind What the tree keeps.
 * @param key Tree key.
 * @param label Level path or room name; empty keeps the stored one.
 * @returns Store.
 */
export async function projectHistoryStoreOpen(
  fileSystem: ProjectFileSystem,
  kind: ProjectHistoryTreeKind,
  key: string,
  label: string,
): Promise<ProjectHistoryStore> {
  await projectHistoryMigrateFor(fileSystem);
  return projectHistoryStoreShared(fileSystem, kind, key, label);
}

/**
 * Returns the shared store of a tree without waiting for the migration.
 *
 * @param fileSystem Project folder.
 * @param kind What the tree keeps.
 * @param key Tree key.
 * @param label Level path or room name; empty keeps the stored one.
 * @returns Store.
 */
export function projectHistoryStoreShared(
  fileSystem: ProjectFileSystem,
  kind: ProjectHistoryTreeKind,
  key: string,
  label: string,
): ProjectHistoryStore {
  let stores = projectHistoryStores.get(fileSystem);
  if (stores === undefined) projectHistoryStores.set(fileSystem, (stores = new Map()));
  const id = `${kind}/${key}`;
  let store = stores.get(id);
  if (store === undefined) {
    const folder = new ProjectHistoryFolderProject(fileSystem, projectHistoryTreeFolder(kind, key));
    stores.set(id, (store = new ProjectHistoryStore(folder, kind, key, label)));
  }
  if (label !== '') store.labelSet(label);
  return store;
}

/**
 * Returns the store of a level's tree.
 *
 * @param fileSystem Project folder.
 * @param sourcePath Level path, or null when untitled.
 * @returns Store.
 */
export function projectHistoryLevelStore(
  fileSystem: ProjectFileSystem,
  sourcePath: string | null,
): Promise<ProjectHistoryStore> {
  return projectHistoryStoreOpen(
    fileSystem,
    'level',
    projectAutosaveKey(sourcePath),
    projectHistoryLevelLabel(sourcePath),
  );
}

/**
 * Creates a tree kept in memory, for a room while no project folder is open.
 *
 * @param roomName Room name.
 * @returns Store.
 */
export function projectHistoryStoreMemory(roomName: string): ProjectHistoryStore {
  return new ProjectHistoryStore(new ProjectHistoryFolderMemory(), 'room', projectHistoryRoomKey(roomName), roomName);
}

/**
 * Lists the stores of every tree in a project folder that has an index.
 *
 * @param fileSystem Project folder.
 * @returns Stores of levels, then of rooms.
 */
export async function projectHistoryStoresList(fileSystem: ProjectFileSystem): Promise<ProjectHistoryStore[]> {
  await projectHistoryMigrateFor(fileSystem);
  const stores: ProjectHistoryStore[] = [];
  for (const kind of ['level', 'room'] as const) {
    const folders = await fileSystem.directoryList(PROJECT_HISTORY_TREE_DIRECTORIES[kind], () => false).catch(() => []);
    for (const folder of folders)
      if (folder.kind === 'directory') stores.push(projectHistoryStoreShared(fileSystem, kind, folder.name, ''));
  }
  return stores;
}

/**
 * Runs the one-time migration of older files of a project folder into trees.
 *
 * @param fileSystem Project folder.
 * @returns Resolves when done.
 */
export function projectHistoryMigrateFor(fileSystem: ProjectFileSystem): Promise<void> {
  return projectHistoryMigrate(fileSystem, (kind, key, label) =>
    projectHistoryStoreShared(fileSystem, kind, key, label),
  );
}
