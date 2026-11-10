import { describe, expect, it, vi } from 'vitest';
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
});
