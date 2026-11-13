import { StoreHandleDatabase, storeHandleDatabaseFactory } from '@/project/fs/store_handle_database.js';
import { sceneFileRecentListParse, type SceneFileRecentEntry } from './scene_file_recent_list.js';

/** Key of the Recent list in the handle database. */
const SCENE_FILE_RECENT_STORE_KEY = 'recent-scenes';

/** Keeps the Recent list somewhere. */
export interface SceneFileRecentStorage {
  /**
   * Reads the list.
   *
   * @returns Entries, newest first.
   */
  load(): Promise<SceneFileRecentEntry[]>;
  /**
   * Writes the list.
   *
   * @param entries Entries, newest first.
   */
  save(entries: readonly SceneFileRecentEntry[]): Promise<void>;
}

/** Keeps the Recent list with its file handles in IndexedDB. */
export class SceneFileRecentStore extends StoreHandleDatabase implements SceneFileRecentStorage {
  /**
   * Creates the store.
   *
   * @param factory IndexedDB factory, or null where there is none.
   */
  constructor(factory: IDBFactory | null = storeHandleDatabaseFactory()) {
    super(factory, SCENE_FILE_RECENT_STORE_KEY);
  }

  /**
   * Reads the list.
   *
   * @returns Valid entries, newest first.
   */
  async load(): Promise<SceneFileRecentEntry[]> {
    return sceneFileRecentListParse(await this.valueGet());
  }

  /**
   * Writes the list.
   *
   * @param entries Entries, newest first.
   */
  async save(entries: readonly SceneFileRecentEntry[]): Promise<void> {
    await this.valuePut(entries.map((entry) => ({ handle: entry.handle, usedAt: entry.usedAt })));
  }
}
