import { describe, expect, it } from 'vitest';
import { StoreProjectHandle } from '@/project/fs/store_project_handle.js';

describe('StoreProjectHandle', () => {
  it('does nothing without IndexedDB', async () => {
    const store = new StoreProjectHandle(null);
    await expect(store.save({ kind: 'directory', name: 'game' } as FileSystemDirectoryHandle)).rejects.toThrow(
      'IndexedDB',
    );
    expect(await store.load()).toBeNull();
    await store.clear();
  });
});

/**
 * Builds a request that succeeds on the next microtask.
 *
 * @param result Result value.
 * @param before Runs before success (upgrade step).
 * @returns Request.
 */
function storeFakeRequest(result: unknown, before?: (request: { result: unknown }) => void) {
  const request = {
    result,
    onsuccess: null as null | (() => void),
    onerror: null,
    onupgradeneeded: null as null | (() => void),
  };
  queueMicrotask(() => {
    before?.(request);
    request.onsuccess?.();
  });
  return request;
}

/**
 * Builds a minimal IndexedDB with one store.
 *
 * @returns Factory and backing map.
 */
function storeFakeFactory() {
  const rows = new Map<string, unknown>();
  const table = {
    put: (value: unknown, key: string) => storeFakeRequest(rows.set(key, value) && undefined),
    get: (key: string) => storeFakeRequest(rows.get(key)),
    delete: (key: string) => storeFakeRequest(rows.delete(key) && undefined),
  };
  const database = {
    transaction: () => ({ objectStore: () => table }),
    close: () => undefined,
    createObjectStore: () => table,
  };
  const factory = {
    open: () =>
      storeFakeRequest(database, (request) =>
        (request as unknown as { onupgradeneeded: (() => void) | null }).onupgradeneeded?.(),
      ),
  };
  return { factory: factory as unknown as IDBFactory, rows };
}

describe('StoreProjectHandle with IndexedDB', () => {
  it('saves, loads and clears the last project handle', async () => {
    const { factory, rows } = storeFakeFactory();
    const store = new StoreProjectHandle(factory);
    const handle = { kind: 'directory', name: 'game' } as FileSystemDirectoryHandle;
    await store.save(handle);
    expect(await store.load()).toBe(handle);
    rows.set('last', { kind: 'file' });
    expect(await store.load()).toBeNull();
    await store.clear();
    expect(rows.size).toBe(0);
  });
});
