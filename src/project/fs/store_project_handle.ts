/** IndexedDB database that remembers folder handles. */
const STORE_PROJECT_HANDLE_DATABASE = 'aiworlded-project';

/** Object store holding the remembered handles. */
const STORE_PROJECT_HANDLE_TABLE = 'handles';

/** Key of the last opened project. */
const STORE_PROJECT_HANDLE_KEY = 'last';

/**
 * Remembers one folder handle in IndexedDB under a key (the last opened project
 * by default), where directory handles survive a reload (localStorage cannot
 * hold them).
 */
export class StoreProjectHandle {
  private readonly factory: IDBFactory | null;
  private readonly key: string;

  /**
   * Creates the store.
   *
   * @param factory IndexedDB factory, or null where there is none.
   * @param key Key the handle is kept under.
   */
  constructor(
    factory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB,
    key = STORE_PROJECT_HANDLE_KEY,
  ) {
    this.factory = factory;
    this.key = key;
  }

  /**
   * Saves the handle.
   *
   * @param handle Folder handle.
   */
  async save(handle: FileSystemDirectoryHandle): Promise<void> {
    await this.run('readwrite', (table) => table.put(handle, this.key));
  }

  /**
   * Loads the remembered handle.
   *
   * @returns Handle, or null when none is remembered or storage fails.
   */
  async load(): Promise<FileSystemDirectoryHandle | null> {
    const value = await this.run('readonly', (table) => table.get(this.key)).catch(() => null);
    return storeProjectHandleIs(value) ? value : null;
  }

  /** Forgets the remembered handle. */
  async clear(): Promise<void> {
    await this.run('readwrite', (table) => table.delete(this.key)).catch(() => undefined);
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
