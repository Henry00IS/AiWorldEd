import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelExportFolderMemory } from '@/io/export/model_export_folder_memory.js';
import type { StoreProjectHandle } from '@/project/fs/store_project_handle.js';

/**
 * Builds a folder handle whose write permission is fixed.
 *
 * @param name Folder name.
 * @param permission Answer of queryPermission and requestPermission.
 * @returns Handle.
 */
function folderHandle(name: string, permission: PermissionState): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
  } as unknown as FileSystemDirectoryHandle;
}

/**
 * Builds a handle store that keeps one handle in memory, like IndexedDB across
 * a reload.
 *
 * @param stored Handle stored before.
 * @returns Store.
 */
function handleStore(stored: FileSystemDirectoryHandle | null = null) {
  const state = { stored };
  const store = {
    save: vi.fn(async (handle: FileSystemDirectoryHandle) => void (state.stored = handle)),
    load: vi.fn(async () => state.stored),
  };
  return { store: store as unknown as StoreProjectHandle, state, save: store.save };
}

describe('ModelExportFolderMemory', () => {
  it('remembers nothing until an export went to a folder', async () => {
    expect(await new ModelExportFolderMemory(handleStore().store).recall()).toBeNull();
  });

  it('recalls the folder of the last export for the session and after a reload', async () => {
    const { store, state, save } = handleStore();
    const memory = new ModelExportFolderMemory(store);
    const unity = folderHandle('UnityGame', 'granted');
    memory.remember(unity);
    expect(save).toHaveBeenCalledWith(unity);
    const recalled = await memory.recall();
    expect(recalled?.label).toBe('UnityGame');
    expect(recalled?.folder).toBe(unity);
    const reloaded = await new ModelExportFolderMemory(handleStore(state.stored).store).recall();
    expect(reloaded?.folder).toBe(unity);
  });

  it('offers a folder whose access lapsed and asks for it again on export', async () => {
    const lapsed = folderHandle('UnityGame', 'prompt');
    const recalled = await new ModelExportFolderMemory(handleStore(lapsed).store).recall();
    expect(recalled?.label).toBe('UnityGame');
    expect(await recalled?.access?.()).toBe(false);
    expect(lapsed.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('drops a folder the browser denies', async () => {
    const denied = folderHandle('UnityGame', 'denied');
    expect(await new ModelExportFolderMemory(handleStore(denied).store).recall()).toBeNull();
  });

  describe('when the browser never answers or fails', () => {
    afterEach(() => vi.useRealTimers());

    /**
     * Recalls with fake timers running out, the way a stale handle leaves the
     * Export dialog waiting.
     *
     * @param memory Memory to ask.
     * @returns Recalled destination.
     */
    async function recallPastWait(memory: ModelExportFolderMemory) {
      vi.useFakeTimers();
      const recalled = memory.recall();
      await vi.advanceTimersByTimeAsync(5000);
      return recalled;
    }

    it('drops a folder whose permission check never answers', async () => {
      const stale = {
        kind: 'directory',
        name: 'Test',
        queryPermission: vi.fn(() => new Promise<PermissionState>(() => undefined)),
        requestPermission: vi.fn(() => new Promise<PermissionState>(() => undefined)),
      } as unknown as FileSystemDirectoryHandle;
      const memory = new ModelExportFolderMemory(handleStore(stale).store);
      expect(await recallPastWait(memory)).toBeNull();
      expect(await recallPastWait(memory)).toBeNull();
    });

    it('refuses exporting to a recalled folder whose permission check stops answering', async () => {
      const stale = folderHandle('Test', 'prompt');
      const recalled = await new ModelExportFolderMemory(handleStore(stale).store).recall();
      vi.mocked(stale.queryPermission).mockImplementation(() => new Promise<PermissionState>(() => undefined));
      vi.useFakeTimers();
      const access = recalled?.access?.();
      await vi.advanceTimersByTimeAsync(5000);
      expect(await access).toBe(false);
      expect(stale.requestPermission).not.toHaveBeenCalled();
    });

    it('drops the folder when reading the stored handle never answers', async () => {
      const store = { save: vi.fn(async () => undefined), load: vi.fn(() => new Promise<null>(() => undefined)) };
      const memory = new ModelExportFolderMemory(store as unknown as StoreProjectHandle);
      expect(await recallPastWait(memory)).toBeNull();
    });

    it('drops the folder when reading the stored handle fails', async () => {
      const store = { save: vi.fn(async () => undefined), load: vi.fn(async () => Promise.reject(new Error('gone'))) };
      expect(await new ModelExportFolderMemory(store as unknown as StoreProjectHandle).recall()).toBeNull();
    });
  });
});
