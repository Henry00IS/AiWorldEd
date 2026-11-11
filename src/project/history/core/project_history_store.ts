import { PROJECT_EDITOR_HISTORY_DIRECTORY } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import {
  projectHistoryDay,
  projectHistoryEntryParse,
  projectHistoryIdCreate,
  projectHistoryPrune,
  projectHistoryStar,
  type ProjectHistoryEntry,
  type ProjectHistoryEntryKind,
  type ProjectHistoryEntrySource,
} from './project_history_entry.js';
import {
  ProjectHistoryFolderMemory,
  ProjectHistoryFolderProject,
  type ProjectHistoryFolder,
} from './project_history_folder.js';

/** An encoded thumbnail. */
export interface ProjectHistoryThumbnailShot {
  blob: Blob;
}

/** Takes a thumbnail of what the editor shows now. */
export type ProjectHistoryThumbnailCapture = () => Promise<ProjectHistoryThumbnailShot | null>;

/** A save about to be recorded. */
export interface ProjectHistoryRecord {
  kind: ProjectHistoryEntryKind;
  source: ProjectHistoryEntrySource;
  time: number;
  path: string | null;
  title: string | null;
  room: string | null;
  objectCount: number;
  /** State file contents. */
  state: string;
  shot: ProjectHistoryThumbnailShot | null;
}

/** File name of the index. */
export const PROJECT_HISTORY_INDEX_FILE = 'index.json';

/** Format marker of the index. */
export const PROJECT_HISTORY_INDEX_FORMAT = 'aiworlded-level-history';

/**
 * Returns the state file of a save, in the folder of its day.
 *
 * @param entry Save.
 * @returns File name relative to the history folder.
 */
export function projectHistoryStateFile(entry: Pick<ProjectHistoryEntry, 'day' | 'id'>): string {
  return `${entry.day}/${entry.id}.json`;
}

/**
 * Returns the thumbnail of a save, in the folder of its day.
 *
 * @param entry Save.
 * @returns File name relative to the history folder.
 */
export function projectHistoryThumbnailFile(entry: Pick<ProjectHistoryEntry, 'day' | 'id'>): string {
  return `${entry.day}/${entry.id}.webp`;
}

/**
 * The saves of a project: one index.json and one folder per day holding each
 * save's state and thumbnail. The index stays cached after the first read;
 * every change runs after the ones before it and ends with one index write. The
 * retention rules run with every new save.
 */
export class ProjectHistoryStore {
  readonly folder: ProjectHistoryFolder;
  private cached: ProjectHistoryEntry[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Creates the store.
   *
   * @param folder History folder.
   */
  constructor(folder: ProjectHistoryFolder) {
    this.folder = folder;
  }

  /**
   * Returns copies of every save; a missing or broken index reads as empty.
   *
   * @returns Saves.
   */
  async entries(): Promise<ProjectHistoryEntry[]> {
    return (await this.load()).map((entry) => ({ ...entry }));
  }

  /**
   * Records a save, then removes the saves the retention rules drop.
   *
   * @param record Save to record.
   * @param now Current time for the retention rules.
   * @returns Copy of the new save.
   */
  add(record: ProjectHistoryRecord, now = record.time): Promise<ProjectHistoryEntry> {
    return this.change(async (entries) => {
      const entry: ProjectHistoryEntry = {
        id: projectHistoryIdCreate(entries, record.time),
        day: projectHistoryDay(record.time),
        kind: record.kind,
        starred: false,
        time: record.time,
        source: record.source,
        path: record.path,
        title: record.title,
        room: record.source === 'room' ? (record.room ?? '') : null,
        objectCount: record.objectCount,
        thumbnail: record.shot !== null,
      };
      await this.folder.write(projectHistoryStateFile(entry), record.state);
      if (record.shot !== null) await this.folder.write(projectHistoryThumbnailFile(entry), record.shot.blob);
      entries.push(entry);
      const removed = new Set(projectHistoryPrune(entries, now).map((item) => item.id));
      await this.filesRemove(entries, removed);
      return { ...entry };
    });
  }

  /**
   * Stars or unstars a save.
   *
   * @param id Save id.
   * @param starred Whether to star it.
   * @returns Copy of the changed save, or null when it is gone.
   */
  star(id: string, starred: boolean): Promise<ProjectHistoryEntry | null> {
    return this.change((entries) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) return null;
      const changed = projectHistoryStar(entries[index]!, starred);
      entries[index] = changed;
      return { ...changed };
    });
  }

  /**
   * Deletes a save and its files.
   *
   * @param id Save id.
   * @returns True when it existed.
   */
  remove(id: string): Promise<boolean> {
    return this.change(async (entries) => {
      const found = entries.some((entry) => entry.id === id);
      await this.filesRemove(entries, new Set([id]));
      return found;
    });
  }

  /**
   * Reads a save's state file.
   *
   * @param entry Save.
   * @returns Contents, or null.
   */
  stateRead(entry: Pick<ProjectHistoryEntry, 'day' | 'id'>): Promise<Blob | null> {
    return this.folder.read(projectHistoryStateFile(entry));
  }

  /**
   * Reads a save's thumbnail.
   *
   * @param entry Save.
   * @returns Image, or null.
   */
  thumbnailRead(entry: Pick<ProjectHistoryEntry, 'day' | 'id'>): Promise<Blob | null> {
    return this.folder.read(projectHistoryThumbnailFile(entry));
  }

  /**
   * Reads the index once.
   *
   * @returns Cached saves (do not change them outside {@link change}).
   */
  private async load(): Promise<ProjectHistoryEntry[]> {
    if (this.cached !== null) return this.cached;
    const file = await this.folder.read(PROJECT_HISTORY_INDEX_FILE);
    const parsed = file === null ? [] : projectHistoryIndexParse(await file.text());
    this.cached ??= parsed;
    return this.cached;
  }

  /**
   * Runs a change after the ones before it, then writes the index. After a
   * failure the index is read again.
   *
   * @param change Changes the saves in place.
   * @returns What the change returned.
   */
  private change<T>(change: (entries: ProjectHistoryEntry[]) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const entries = await this.load();
      const result = await change(entries);
      const index = { format: PROJECT_HISTORY_INDEX_FORMAT, version: 1, entries };
      await this.folder.write(PROJECT_HISTORY_INDEX_FILE, JSON.stringify(index));
      return result;
    });
    this.queue = run.catch(() => {
      this.cached = null;
    });
    return run;
  }

  /**
   * Takes saves out of the list and deletes their files, and the folder of a
   * day that has no saves left.
   *
   * @param entries Saves, changed in place.
   * @param ids Ids to remove.
   */
  private async filesRemove(entries: ProjectHistoryEntry[], ids: ReadonlySet<string>): Promise<void> {
    const removed = entries.filter((entry) => ids.has(entry.id));
    if (removed.length === 0) return;
    entries.splice(0, entries.length, ...entries.filter((entry) => !ids.has(entry.id)));
    for (const entry of removed) {
      await this.folder.remove(projectHistoryStateFile(entry));
      await this.folder.remove(projectHistoryThumbnailFile(entry));
    }
    for (const day of new Set(removed.map((entry) => entry.day)))
      if (!entries.some((entry) => entry.day === day)) await this.folder.remove(day);
  }
}

/**
 * Parses the index.
 *
 * @param text File contents.
 * @returns Valid saves; an unknown file reads as empty.
 */
export function projectHistoryIndexParse(text: string): ProjectHistoryEntry[] {
  try {
    const value = JSON.parse(text) as { format?: unknown; entries?: unknown } | null;
    if (value?.format !== PROJECT_HISTORY_INDEX_FORMAT || !Array.isArray(value.entries)) return [];
    return value.entries.flatMap((item: unknown) => projectHistoryEntryParse(item) ?? []);
  } catch {
    return [];
  }
}

/** Stores of each project folder, so every user shares one index. */
const projectHistoryStores = new WeakMap<ProjectFileSystem, ProjectHistoryStore>();

/**
 * Returns the shared store of a project folder.
 *
 * @param fileSystem Project folder.
 * @returns Store.
 */
export function projectHistoryStoreFor(fileSystem: ProjectFileSystem): ProjectHistoryStore {
  let store = projectHistoryStores.get(fileSystem);
  if (store === undefined) {
    store = new ProjectHistoryStore(new ProjectHistoryFolderProject(fileSystem, PROJECT_EDITOR_HISTORY_DIRECTORY));
    projectHistoryStores.set(fileSystem, store);
  }
  return store;
}

/**
 * Creates a store kept in memory, for a room while no project folder is open.
 *
 * @returns Store.
 */
export function projectHistoryStoreMemory(): ProjectHistoryStore {
  return new ProjectHistoryStore(new ProjectHistoryFolderMemory());
}
