import { StoreHandleDatabase, storeHandleDatabaseFactory } from './store_handle_database.js';

/** Key of the last opened project. */
const STORE_PROJECT_HANDLE_KEY = 'last';

/**
 * Remembers one folder handle in IndexedDB under a key (the last opened project
 * by default).
 */
export class StoreProjectHandle extends StoreHandleDatabase {
  /**
   * Creates the store.
   *
   * @param factory IndexedDB factory, or null where there is none.
   * @param key Key the handle is kept under.
   */
  constructor(factory: IDBFactory | null = storeHandleDatabaseFactory(), key = STORE_PROJECT_HANDLE_KEY) {
    super(factory, key);
  }

  /**
   * Saves the handle.
   *
   * @param handle Folder handle.
   */
  async save(handle: FileSystemDirectoryHandle): Promise<void> {
    await this.valuePut(handle);
  }

  /**
   * Loads the remembered handle.
   *
   * @returns Handle, or null when none is remembered or storage fails.
   */
  async load(): Promise<FileSystemDirectoryHandle | null> {
    const value = await this.valueGet();
    return storeProjectHandleIs(value) ? value : null;
  }

  /** Forgets the remembered handle. */
  async clear(): Promise<void> {
    await this.valueDelete();
  }
}

/**
 * Tells whether a stored value looks like a directory handle.
 *
 * @param value Stored value.
 * @returns True for a directory handle.
 */
function storeProjectHandleIs(value: unknown): value is FileSystemDirectoryHandle {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'directory';
}
