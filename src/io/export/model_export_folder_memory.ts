import { fileSystemHandleAnswer } from '@/project/fs/file_system_handle_answer.js';
import { StoreProjectHandle } from '@/project/fs/store_project_handle.js';
import { modelExportDirectoryDestination, type ModelExportDestination } from './model_export_destination.js';

/** Key of the last export folder in the folder handle store. */
const MODEL_EXPORT_FOLDER_MEMORY_KEY = 'model-export';

/**
 * Remembers the folder the last model export went to, for the session and in
 * IndexedDB across reloads, so the Export dialog starts there.
 */
export class ModelExportFolderMemory {
  private readonly store: StoreProjectHandle;
  private folder: FileSystemDirectoryHandle | null = null;
  private loading: Promise<FileSystemDirectoryHandle | null> | null = null;

  /**
   * Creates the memory.
   *
   * @param store Folder handle store.
   */
  constructor(store: StoreProjectHandle = new StoreProjectHandle(undefined, MODEL_EXPORT_FOLDER_MEMORY_KEY)) {
    this.store = store;
  }

  /**
   * Returns the remembered folder as a destination, unless the browser denies
   * writing to it; a lapsed permission is asked again on export. A folder the
   * browser fails or never answers for is dropped for the session.
   *
   * @returns Destination, or null when none is remembered or usable.
   */
  async recall(): Promise<ModelExportDestination | null> {
    const folder = await fileSystemHandleAnswer(this.usableFolder()).catch(() => null);
    if (folder === null) this.forget();
    return folder === null ? null : modelExportDirectoryDestination(folder);
  }

  /**
   * Remembers the folder of an export that was written.
   *
   * @param folder Picked folder.
   */
  remember(folder: FileSystemDirectoryHandle): void {
    this.folder = folder;
    void this.store.save(folder).catch(() => undefined);
  }

  /** @returns The remembered folder, or null when none is or it is denied. */
  private async usableFolder(): Promise<FileSystemDirectoryHandle | null> {
    const folder = this.folder ?? (await this.load());
    return folder === null || (await modelExportFolderMemoryDenied(folder)) ? null : folder;
  }

  /** Drops the remembered folder for the session; the store keeps it. */
  private forget(): void {
    this.folder = null;
    this.loading = Promise.resolve(null);
  }

  /** @returns The stored folder, read once per session. */
  private load(): Promise<FileSystemDirectoryHandle | null> {
    this.loading ??= this.store.load();
    return this.loading;
  }
}

/**
 * Tells whether the browser refuses writing to a folder.
 *
 * @param folder Folder handle.
 * @returns True when denied or unanswerable.
 */
async function modelExportFolderMemoryDenied(folder: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return (await folder.queryPermission({ mode: 'readwrite' })) === 'denied';
  } catch {
    return true;
  }
}
