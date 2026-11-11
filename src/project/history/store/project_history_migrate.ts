import { PROJECT_EDITOR_LOCAL_DIRECTORY } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileSystem, ProjectFileSystemEntry } from '@/project/fs/project_file_system.js';
import { projectPathJoin } from '@/project/fs/project_path.js';
import {
  projectHistoryNodeIdCreate,
  type ProjectHistoryIndex,
  type ProjectHistoryNode,
  type ProjectHistoryTreeKind,
} from '@/project/history/tree/project_history_tree.js';
import { projectHistoryLevelKeyLabel, projectHistoryRoomKey } from './project_history_keys.js';
import { projectHistoryStateFile, type ProjectHistoryStore } from './project_history_store.js';
import {
  projectHistoryMigrateLevelParse,
  projectHistoryMigrateRoomParse,
  type ProjectHistoryMigrateFile,
} from './project_history_migrate_names.js';

/** Folder of the latest autosave of each level, as older versions wrote it. */
export const PROJECT_HISTORY_MIGRATE_AUTOSAVE = `${PROJECT_EDITOR_LOCAL_DIRECTORY}/Autosave`;

/** Folder of the rotated autosave copies of older versions. */
export const PROJECT_HISTORY_MIGRATE_COPIES = `${PROJECT_HISTORY_MIGRATE_AUTOSAVE}/History`;

/** Folder of the room snapshots of older versions. */
export const PROJECT_HISTORY_MIGRATE_ROOMS = `${PROJECT_EDITOR_LOCAL_DIRECTORY}/Snapshots`;

/** Characters read from the start of an older file for its details. */
const PROJECT_HISTORY_MIGRATE_HEAD = 4096;

/** Migration of each project folder, run once per session. */
const projectHistoryMigrations = new WeakMap<ProjectFileSystem, Promise<void>>();

/** Opens the store of a tree for the migration. */
export type ProjectHistoryMigrateStoreOpen = (
  kind: ProjectHistoryTreeKind,
  key: string,
  label: string,
) => ProjectHistoryStore;

/**
 * Moves the autosaves, autosave copies and room snapshots older versions wrote
 * into trees, once per project folder and session: each level's files become
 * one branch in time order, each room's snapshots one branch of that room.
 * Locked files and snapshots taken by hand keep a name, so cleanup keeps them.
 *
 * @param fileSystem Project folder.
 * @param open Opens the store of a tree.
 * @returns Resolves when done; failures leave the remaining files in place.
 */
export function projectHistoryMigrate(
  fileSystem: ProjectFileSystem,
  open: ProjectHistoryMigrateStoreOpen,
): Promise<void> {
  let migration = projectHistoryMigrations.get(fileSystem);
  if (migration === undefined) {
    const run = fileSystem.writable ? projectHistoryMigrateRun(fileSystem, open) : Promise.resolve();
    migration = run.catch(() => undefined);
    projectHistoryMigrations.set(fileSystem, migration);
  }
  return migration;
}

/**
 * Runs the migration of a project folder.
 *
 * @param fileSystem Project folder.
 * @param open Opens the store of a tree.
 */
async function projectHistoryMigrateRun(
  fileSystem: ProjectFileSystem,
  open: ProjectHistoryMigrateStoreOpen,
): Promise<void> {
  const groups = await projectHistoryMigrateGroups(fileSystem);
  for (const group of groups.values()) await projectHistoryMigrateGroup(fileSystem, open, group);
  for (const folder of [PROJECT_HISTORY_MIGRATE_COPIES, PROJECT_HISTORY_MIGRATE_ROOMS])
    await projectHistoryMigrateFoldersRemove(fileSystem, folder);
}

/** Older files that go into one tree. */
interface ProjectHistoryMigrateGroup {
  kind: ProjectHistoryTreeKind;
  key: string;
  files: ProjectHistoryMigrateFile[];
}

/**
 * Lists the older files and groups them by tree.
 *
 * @param fileSystem Project folder.
 * @returns Groups by tree id.
 */
async function projectHistoryMigrateGroups(
  fileSystem: ProjectFileSystem,
): Promise<Map<string, ProjectHistoryMigrateGroup>> {
  const files = [
    ...(await projectHistoryMigrateLatest(fileSystem)),
    ...(await projectHistoryMigrateCopies(fileSystem)),
    ...(await projectHistoryMigrateRooms(fileSystem)),
  ];
  const groups = new Map<string, ProjectHistoryMigrateGroup>();
  for (const file of files) {
    const id = `${file.kind}/${file.key}`;
    const group = groups.get(id) ?? { kind: file.kind, key: file.key, files: [] };
    group.files.push(file);
    groups.set(id, group);
  }
  return groups;
}

/**
 * Lists a folder; a missing folder lists nothing.
 *
 * @param fileSystem Project folder.
 * @param path Folder path.
 * @returns Entries with times.
 */
function projectHistoryMigrateList(fileSystem: ProjectFileSystem, path: string): Promise<ProjectFileSystemEntry[]> {
  return fileSystem.directoryList(path, () => true).catch(() => []);
}

/**
 * Lists the latest autosave of each level.
 *
 * @param fileSystem Project folder.
 * @returns Older files.
 */
async function projectHistoryMigrateLatest(fileSystem: ProjectFileSystem): Promise<ProjectHistoryMigrateFile[]> {
  const entries = await projectHistoryMigrateList(fileSystem, PROJECT_HISTORY_MIGRATE_AUTOSAVE);
  return entries.flatMap((entry) => {
    const path = projectPathJoin(PROJECT_HISTORY_MIGRATE_AUTOSAVE, entry.name);
    return entry.kind === 'file' ? projectHistoryMigrateLevelParse(path, entry.name, null, entry.lastModified) : [];
  });
}

/**
 * Lists the rotated autosave copies and snapshots of every level.
 *
 * @param fileSystem Project folder.
 * @returns Older files.
 */
async function projectHistoryMigrateCopies(fileSystem: ProjectFileSystem): Promise<ProjectHistoryMigrateFile[]> {
  const files: ProjectHistoryMigrateFile[] = [];
  for (const level of await projectHistoryMigrateList(fileSystem, PROJECT_HISTORY_MIGRATE_COPIES)) {
    if (level.kind !== 'directory') continue;
    const folder = projectPathJoin(PROJECT_HISTORY_MIGRATE_COPIES, level.name);
    for (const entry of await projectHistoryMigrateList(fileSystem, folder))
      if (entry.kind === 'file')
        files.push(...projectHistoryMigrateLevelParse(projectPathJoin(folder, entry.name), entry.name, level.name));
  }
  return files;
}

/**
 * Lists the room snapshot files.
 *
 * @param fileSystem Project folder.
 * @returns Older files; their room is read from each file later.
 */
async function projectHistoryMigrateRooms(fileSystem: ProjectFileSystem): Promise<ProjectHistoryMigrateFile[]> {
  const entries = await projectHistoryMigrateList(fileSystem, PROJECT_HISTORY_MIGRATE_ROOMS);
  const files: ProjectHistoryMigrateFile[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'file') continue;
    const path = projectPathJoin(PROJECT_HISTORY_MIGRATE_ROOMS, entry.name);
    const file = projectHistoryMigrateRoomParse(path, entry.name);
    if (file !== null) files.push({ ...file, key: await projectHistoryMigrateRoomKey(fileSystem, path) });
  }
  return files;
}

/**
 * Reads the room name from the start of a room snapshot file.
 *
 * @param fileSystem Project folder.
 * @param path File path.
 * @returns Room tree key.
 */
async function projectHistoryMigrateRoomKey(fileSystem: ProjectFileSystem, path: string): Promise<string> {
  const head = await projectHistoryMigrateHead(fileSystem, path);
  return projectHistoryRoomKey(projectHistoryMigrateField(head, 'room') ?? '');
}

/**
 * Reads a text field from the start of a saved file.
 *
 * @param head Start of the file.
 * @param field Field name.
 * @returns Value, or null when missing or cut off.
 */
export function projectHistoryMigrateField(head: string, field: 'room' | 'sourcePath'): string | null {
  const match = new RegExp(`"${field}":("(?:[^"\\\\]|\\\\.)*")`).exec(head)?.[1];
  if (match === undefined) return null;
  try {
    return String(JSON.parse(match));
  } catch {
    return null;
  }
}

/**
 * Reads the start of a file.
 *
 * @param fileSystem Project folder.
 * @param path File path.
 * @returns Start of the text; empty when unreadable.
 */
async function projectHistoryMigrateHead(fileSystem: ProjectFileSystem, path: string): Promise<string> {
  const file = await fileSystem.fileRead(path).catch(() => null);
  return file === null ? '' : file.slice(0, PROJECT_HISTORY_MIGRATE_HEAD).text();
}

/**
 * Moves one tree's older files into its tree: oldest first, each one growing
 * from the one before, the newest becoming the marker. A latest autosave that
 * has a copy from the same moment is dropped as a duplicate.
 *
 * @param fileSystem Project folder.
 * @param open Opens a tree store.
 * @param group Older files of the tree.
 */
async function projectHistoryMigrateGroup(
  fileSystem: ProjectFileSystem,
  open: ProjectHistoryMigrateStoreOpen,
  group: ProjectHistoryMigrateGroup,
): Promise<void> {
  const files = projectHistoryMigrateDistinct(group.files);
  const label = group.kind === 'room' ? group.key : projectHistoryLevelKeyLabel(group.key);
  const store = open(group.kind, group.key, label);
  await store.change(async (index) => {
    for (const file of files) await projectHistoryMigrateFile(fileSystem, store, index, file);
  });
  for (const file of group.files) await fileSystem.fileRemove(file.path).catch(() => undefined);
}

/**
 * Sorts files oldest first and drops a latest autosave whose time matches a
 * copy within two seconds.
 *
 * @param files Older files of one tree.
 * @returns Files to move.
 */
export function projectHistoryMigrateDistinct(
  files: readonly ProjectHistoryMigrateFile[],
): ProjectHistoryMigrateFile[] {
  const copies = files.filter((file) => !file.latest);
  const latest = files.filter((file) => file.latest && !copies.some((copy) => Math.abs(copy.time - file.time) <= 2000));
  return [...copies, ...latest].sort((left, right) => left.time - right.time);
}

/**
 * Copies one older file into a tree as a node that grows from the marker.
 *
 * @param fileSystem Project folder.
 * @param store Tree store.
 * @param index Tree index, changed in place.
 * @param file Older file.
 */
async function projectHistoryMigrateFile(
  fileSystem: ProjectFileSystem,
  store: ProjectHistoryStore,
  index: ProjectHistoryIndex,
  file: ProjectHistoryMigrateFile,
): Promise<void> {
  const blob = await fileSystem.fileRead(file.path).catch(() => null);
  if (blob === null) return;
  const head = await blob.slice(0, PROJECT_HISTORY_MIGRATE_HEAD).text();
  const node = projectHistoryMigrateNode(index, file, head);
  const label = projectHistoryMigrateField(head, store.kind === 'room' ? 'room' : 'sourcePath');
  if (label !== null && label !== '') store.labelSet(label);
  await store.folder.write(projectHistoryStateFile(node.id), blob);
  index.nodes.push(node);
  index.marker = node.id;
  index.live = null;
}

/**
 * Builds the node of an older file.
 *
 * @param index Tree index.
 * @param file Older file.
 * @param head Start of its text.
 * @returns Node growing from the marker.
 */
function projectHistoryMigrateNode(
  index: ProjectHistoryIndex,
  file: ProjectHistoryMigrateFile,
  head: string,
): ProjectHistoryNode {
  const count = Number(/"objectCount":(\d{1,9})[,}]/.exec(head)?.[1] ?? file.objectCount ?? 0);
  const saved = Number(/"savedAt":(\d{1,15})[,}]/.exec(head)?.[1] ?? 0);
  const time = file.latest && saved > 0 ? saved : file.time;
  return {
    id: projectHistoryNodeIdCreate(index, time),
    parent: index.marker,
    kind: file.name === '' ? 'session' : 'snapshot',
    name: file.name,
    note: '',
    time,
    started: time,
    autosaves: file.name === '' ? 1 : 0,
    objectCount: count,
    thumbnail: null,
  };
}

/**
 * Removes the now empty folders below an older folder, then the folder.
 *
 * @param fileSystem Project folder.
 * @param folder Older folder.
 */
async function projectHistoryMigrateFoldersRemove(fileSystem: ProjectFileSystem, folder: string): Promise<void> {
  for (const entry of await projectHistoryMigrateList(fileSystem, folder))
    if (entry.kind === 'directory')
      await fileSystem.fileRemove(projectPathJoin(folder, entry.name)).catch(() => undefined);
  await fileSystem.fileRemove(folder).catch(() => undefined);
}
