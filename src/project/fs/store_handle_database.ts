/** IndexedDB database that remembers file and folder handles. */
const STORE_HANDLE_DATABASE_NAME = 'aiworlded-project';

/** Object store holding the remembered values. */
const STORE_HANDLE_DATABASE_TABLE = 'handles';

/**
 * Keeps one value under a key in IndexedDB, where file and folder handles
 * survive a reload (localStorage cannot hold them).
 */
export class StoreHandleDatabase {
  private readonly factory: IDBFactory | null;
  private readonly key: string;

  /**
   * Creates the store.
   *
   * @param factory IndexedDB factory, or null where there is none.
   * @param key Key the value is kept under.
   */
  constructor(factory: IDBFactory | null, key: string) {
    this.factory = factory;
    this.key = key;
  }

  /**
   * Writes the value.
   *
   * @param value Structured-cloneable value.
   */
  protected async valuePut(value: unknown): Promise<void> {
    await this.run('readwrite', (table) => table.put(value, this.key));
  }

  /**
   * Reads the value.
   *
   * @returns Stored value, or null when storage fails.
   */
  protected async valueGet(): Promise<unknown> {
    return this.run('readonly', (table) => table.get(this.key)).catch(() => null);
  }

  /** Deletes the value. */
  protected async valueDelete(): Promise<void> {
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
      const table = database.transaction(STORE_HANDLE_DATABASE_TABLE, mode).objectStore(STORE_HANDLE_DATABASE_TABLE);
      return await storeHandleDatabaseRequest(request(table));
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
    const opening = factory.open(STORE_HANDLE_DATABASE_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE_HANDLE_DATABASE_TABLE);
    return storeHandleDatabaseRequest(opening);
  }
}

/**
 * Returns the browser's IndexedDB factory.
 *
 * @returns Factory, or null where there is none.
 */
export function storeHandleDatabaseFactory(): IDBFactory | null {
  return typeof indexedDB === 'undefined' ? null : indexedDB;
}

/**
 * Wraps an IndexedDB request in a promise.
 *
 * @param request Request.
 * @returns Request result.
 */
function storeHandleDatabaseRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}
