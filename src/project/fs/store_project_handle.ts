/** IndexedDB database that remembers the last project folder. */
const STORE_PROJECT_HANDLE_DATABASE = 'aiworlded-project';

/** Object store holding the remembered handle. */
const STORE_PROJECT_HANDLE_TABLE = 'handles';

/** Key of the last opened project. */
const STORE_PROJECT_HANDLE_KEY = 'last';

/**
 * Remembers the last opened project folder handle in IndexedDB, where directory
 * handles survive a reload (localStorage cannot hold them).
 */
export class StoreProjectHandle {
  private readonly factory: IDBFactory | null;

  /**
   * Creates the store.
   *
   * @param factory IndexedDB factory, or null where there is none.
   */
  constructor(factory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB) {
    this.factory = factory;
  }

  /**
   * Saves the handle of the opened project.
   *
   * @param handle Project root handle.
   */
  async save(handle: FileSystemDirectoryHandle): Promise<void> {
    await this.run('readwrite', (table) => table.put(handle, STORE_PROJECT_HANDLE_KEY));
  }

  /**
   * Loads the remembered handle.
   *
   * @returns Handle, or null when none is remembered or storage fails.
   */
  async load(): Promise<FileSystemDirectoryHandle | null> {
    const value = await this.run('readonly', (table) => table.get(STORE_PROJECT_HANDLE_KEY)).catch(() => null);
    return storeProjectHandleIs(value) ? value : null;
  }

  /** Forgets the remembered handle. */
  async clear(): Promise<void> {
    await this.run('readwrite', (table) => table.delete(STORE_PROJECT_HANDLE_KEY)).catch(() => undefined);
  }

  /**
   * Runs one request in a transaction.
   *
   * @param mode Transaction mode.
   * @param request Builds the request.
   * @returns Request result.
   */
  private async run(mode: IDBTransactionMode, request: (table: IDBObjectStore) => IDBRequest): Promise<unknown> {
    const database = await this.open();
    try {
      const table = database.transaction(STORE_PROJECT_HANDLE_TABLE, mode).objectStore(STORE_PROJECT_HANDLE_TABLE);
      return await storeProjectHandleRequest(request(table));
    } finally {
      database.close();
    }
  }

  /**
   * Opens the database, creating its table on first use.
   *
   * @returns Database.
   */
  private open(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (factory === null) return Promise.reject(new Error('IndexedDB is unavailable'));
    const opening = factory.open(STORE_PROJECT_HANDLE_DATABASE, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE_PROJECT_HANDLE_TABLE);
    return storeProjectHandleRequest(opening);
  }
}

/**
 * Wraps an IndexedDB request in a promise.
 *
 * @param request Request.
 * @returns Request result.
 */
function storeProjectHandleRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
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
