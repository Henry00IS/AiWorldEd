import {
  projectHistoryIndexCreate,
  projectHistoryIndexParse,
  type ProjectHistoryIndex,
  type ProjectHistoryTreeKind,
} from '@/project/history/tree/project_history_tree.js';
import type { ProjectHistoryFolder } from './project_history_folder.js';

/** File name of a tree's index. */
export const PROJECT_HISTORY_INDEX_FILE = 'index.json';

/** Extension of a node's state file. */
export const PROJECT_HISTORY_STATE_EXTENSION = 'json';

/** Extension of a node's thumbnail. */
export const PROJECT_HISTORY_THUMBNAIL_EXTENSION = 'webp';

/**
 * Returns the state file name of a node.
 *
 * @param id Node id.
 * @returns File name.
 */
export function projectHistoryStateFile(id: string): string {
  return `${id}.${PROJECT_HISTORY_STATE_EXTENSION}`;
}

/**
 * Returns the thumbnail file name of a node.
 *
 * @param id Node id.
 * @returns File name.
 */
export function projectHistoryThumbnailFile(id: string): string {
  return `${id}.${PROJECT_HISTORY_THUMBNAIL_EXTENSION}`;
}

/**
 * One tree on disk or in memory: its index stays cached after the first read,
 * and every change runs one after the other and ends with one index write.
 */
export class ProjectHistoryStore {
  readonly folder: ProjectHistoryFolder;
  readonly kind: ProjectHistoryTreeKind;
  readonly key: string;
  private label: string;
  private cached: ProjectHistoryIndex | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Creates the store.
   *
   * @param folder Tree folder.
   * @param kind What the tree keeps.
   * @param key Tree key (folder name).
   * @param label Level path or room name for a new index.
   */
  constructor(folder: ProjectHistoryFolder, kind: ProjectHistoryTreeKind, key: string, label: string) {
    this.folder = folder;
    this.kind = kind;
    this.key = key;
    this.label = label;
  }

  /**
   * Returns the index, read once; a missing or broken index reads as empty.
   *
   * @returns Index (do not change it outside {@link change}).
   */
  async index(): Promise<ProjectHistoryIndex> {
    if (this.cached !== null) return this.cached;
    const file = await this.folder.read(PROJECT_HISTORY_INDEX_FILE);
    const parsed = file === null ? null : projectHistoryIndexParse(await file.text());
    this.cached ??= parsed ?? projectHistoryIndexCreate(this.kind, this.label);
    return this.cached;
  }

  /**
   * Runs a change after the ones before it, then writes the index. The change
   * may write node files before the index names them. After a failure the index
   * is read again from the folder.
   *
   * @param change Changes the index in place.
   * @returns What the change returned.
   */
  change<T>(change: (index: ProjectHistoryIndex) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const index = await this.index();
      const result = await change(index);
      if (this.label !== '') index.label = this.label;
      await this.folder.write(PROJECT_HISTORY_INDEX_FILE, JSON.stringify(index));
      return result;
    });
    this.queue = run.catch(() => {
      this.cached = null;
    });
    return run;
  }

  /**
   * Updates the label written with the next change.
   *
   * @param label Level path or room name.
   */
  labelSet(label: string): void {
    this.label = label;
  }

  /**
   * Reads a node's state file.
   *
   * @param id Node id.
   * @returns Contents, or null.
   */
  stateRead(id: string): Promise<Blob | null> {
    return this.folder.read(projectHistoryStateFile(id));
  }

  /**
   * Reads a node's thumbnail.
   *
   * @param id Node id.
   * @returns Image, or null.
   */
  thumbnailRead(id: string): Promise<Blob | null> {
    return this.folder.read(projectHistoryThumbnailFile(id));
  }

  /**
   * Removes the state and thumbnail files of nodes.
   *
   * @param ids Node ids.
   */
  async filesRemove(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.folder.remove(projectHistoryStateFile(id));
      await this.folder.remove(projectHistoryThumbnailFile(id));
    }
  }
}
