import { downloadBlob } from '@/io/dialog/manager_file_dialog.js';

/** Where an export writes its files, by path relative to the model's folder. */
export interface ModelExportDestination {
  /** Folder name shown in the dialog. */
  label: string;
  /** The picked folder it writes into; absent for project folders and Downloads. */
  folder?: FileSystemDirectoryHandle;
  /**
   * Asks again for write access where the browser forgot it (after a reload);
   * absent where access never lapses. Call it during the user's click.
   *
   * @returns True when writing is allowed.
   */
  access?: () => Promise<boolean>;
  /**
   * Tells whether a file exists.
   *
   * @param path Relative path.
   * @returns True when it exists.
   */
  exists(path: string): Promise<boolean>;
  /**
   * Writes a file, creating its folders.
   *
   * @param path Relative path.
   * @param blob Contents.
   */
  write(path: string, blob: Blob): Promise<void>;
}

/** The part of a directory handle the destination uses. */
interface ModelExportDirectoryHandle {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ModelExportDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
}

/**
 * Writes into a folder the user picked.
 *
 * @param handle Directory handle from showDirectoryPicker.
 * @returns Destination.
 */
export function modelExportDirectoryDestination(handle: FileSystemDirectoryHandle): ModelExportDestination {
  const root = handle as unknown as ModelExportDirectoryHandle;
  const folderOf = async (path: string, create: boolean) => {
    const parts = path.split('/');
    const name = parts.pop()!;
    let directory = root;
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
    return { directory, name };
  };
  return {
    label: root.name,
    folder: handle,
    access: () => modelExportDirectoryAccess(handle),
    exists: async (path) => {
      try {
        const { directory, name } = await folderOf(path, false);
        await directory.getFileHandle(name);
        return true;
      } catch {
        return false;
      }
    },
    write: async (path, blob) => {
      const { directory, name } = await folderOf(path, true);
      const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
      await writable.write(blob);
      await writable.close();
    },
  };
}

/**
 * Checks write access to a picked folder and asks for it when it lapsed.
 *
 * @param handle Picked folder.
 * @returns True when writing is allowed.
 */
async function modelExportDirectoryAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const descriptor = { mode: 'readwrite' as const };
  try {
    if ((await handle.queryPermission(descriptor)) === 'granted') return true;
    return (await handle.requestPermission(descriptor)) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Saves each file as a browser download (no folders), for browsers without a
 * folder picker.
 *
 * @returns Destination.
 */
export function modelExportDownloadsDestination(): ModelExportDestination {
  return {
    label: 'Downloads',
    exists: async () => false,
    write: async (path, blob) => downloadBlob(blob, path.replace(/^.*\//, '')),
  };
}
