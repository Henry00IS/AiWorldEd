import type {
  ProjectFileSystem,
  ProjectFileSystemChanged,
  ProjectFileSystemEntry,
  ProjectFileSystemWatchMode,
} from './project_file_system.js';
import { projectPathName, projectPathParent, projectPathSegments } from './project_path.js';

/** Access mode requested for project folders. */
const PROJECT_FILE_SYSTEM_HANDLE_MODE: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };

/**
 * Project folder backed by a File System Access directory handle (Chromium,
 * Edge, the Windows desktop app). Writes go through createWritable, which
 * replaces the file only when the write completes.
 */
export class ProjectFileSystemHandle implements ProjectFileSystem {
  readonly name: string;
  readonly writable = true;
  readonly root: FileSystemDirectoryHandle;

  /**
   * Wraps a directory handle.
   *
   * @param root Project root handle.
   */
  constructor(root: FileSystemDirectoryHandle) {
    this.root = root;
    this.name = root.name;
  }

  /**
   * Returns "observer" when the browser has FileSystemObserver, else "poll".
   *
   * @returns Watch mode.
   */
  watchMode(): ProjectFileSystemWatchMode {
    return projectFileSystemObserverConstructor() === null ? 'poll' : 'observer';
  }

  /**
   * Queries read and write permission.
   *
   * @returns Permission state.
   */
  permissionQuery(): Promise<PermissionState> {
    return this.root.queryPermission(PROJECT_FILE_SYSTEM_HANDLE_MODE);
  }

  /**
   * Requests read and write permission (needs a user gesture).
   *
   * @returns True when granted.
   */
  async permissionRequest(): Promise<boolean> {
    return (await this.root.requestPermission(PROJECT_FILE_SYSTEM_HANDLE_MODE)) === 'granted';
  }

  /**
   * Lists a folder's children, reading file stats where wanted.
   *
   * @param path Folder path.
   * @param statWanted Tells which file names need size and time.
   * @returns Children, or an empty list when the folder is gone.
   */
  async directoryList(path: string, statWanted: (name: string) => boolean): Promise<ProjectFileSystemEntry[]> {
    const directory = await this.directoryAt(path, false);
    if (directory === null) return [];
    const handles: FileSystemHandle[] = [];
    for await (const handle of directory.values()) handles.push(handle);
    const entries = await Promise.all(handles.map((handle) => projectFileSystemHandleEntry(handle, statWanted)));
    return entries.filter((entry): entry is ProjectFileSystemEntry => entry !== null);
  }

  /**
   * Reads a file.
   *
   * @param path File path.
   * @returns File.
   */
  async fileRead(path: string): Promise<File> {
    const directory = await this.directoryAt(projectPathParent(path), false);
    if (directory === null) throw new Error(`Missing folder for ${path}`);
    const handle = await directory.getFileHandle(projectPathName(path));
    return handle.getFile();
  }

  /**
   * Writes a file through a swap file that replaces it on close.
   *
   * @param path File path.
   * @param data Contents.
   */
  async fileWrite(path: string, data: string | Blob): Promise<void> {
    const directory = await this.directoryAt(projectPathParent(path), true);
    if (directory === null) throw new Error(`Cannot create folder for ${path}`);
    const handle = await directory.getFileHandle(projectPathName(path), { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Deletes a file; a missing file is ignored.
   *
   * @param path File path.
   */
  async fileRemove(path: string): Promise<void> {
    const directory = await this.directoryAt(projectPathParent(path), false);
    await directory?.removeEntry(projectPathName(path)).catch(projectFileSystemHandleMissingIgnore);
  }

  /**
   * Starts a recursive FileSystemObserver on the root.
   *
   * @param changed Runs with the changed paths.
   * @returns Disconnects the observer, or null when unsupported.
   */
  async observe(changed: ProjectFileSystemChanged): Promise<(() => void) | null> {
    const constructor = projectFileSystemObserverConstructor();
    if (constructor === null) return null;
    const observer = new constructor((records) => changed(projectFileSystemObserverPaths(records)));
    try {
      await observer.observe(this.root, { recursive: true });
    } catch {
      return null;
    }
    return () => observer.disconnect();
  }

  /**
   * Walks to a folder handle.
   *
   * @param path Folder path.
   * @param create Whether missing folders are created.
   * @returns Folder handle, or null when missing.
   */
  private async directoryAt(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let directory = this.root;
    for (const segment of projectPathSegments(path)) {
      try {
        directory = await directory.getDirectoryHandle(segment, { create });
      } catch {
        return null;
      }
    }
    return directory;
  }
}

/**
 * Describes one child handle.
 *
 * @param handle Child handle.
 * @param statWanted Tells which file names need size and time.
 * @returns Entry, or null when the file vanished while listing.
 */
async function projectFileSystemHandleEntry(
  handle: FileSystemHandle,
  statWanted: (name: string) => boolean,
): Promise<ProjectFileSystemEntry | null> {
  if (handle.kind === 'directory') return { name: handle.name, kind: 'directory' };
  if (!statWanted(handle.name)) return { name: handle.name, kind: 'file' };
  try {
    const file = await (handle as FileSystemFileHandle).getFile();
    return { name: handle.name, kind: 'file', size: file.size, lastModified: file.lastModified };
  } catch {
    return null;
  }
}

/**
 * Rethrows every error except a missing entry.
 *
 * @param error Error from removeEntry.
 */
function projectFileSystemHandleMissingIgnore(error: unknown): void {
  if (error instanceof DOMException && error.name === 'NotFoundError') return;
  throw error;
}

/**
 * Returns the FileSystemObserver constructor when the browser has one.
 *
 * @returns Constructor, or null.
 */
export function projectFileSystemObserverConstructor(): FileSystemObserverConstructor | null {
  const candidate = (globalThis as { FileSystemObserver?: unknown }).FileSystemObserver;
  return typeof candidate === 'function' ? (candidate as FileSystemObserverConstructor) : null;
}

/**
 * Turns observer records into changed paths, or null when one record cannot
 * name its path (an error or an unknown change).
 *
 * @param records Observer records.
 * @returns Changed paths, or null for "rescan everything".
 */
export function projectFileSystemObserverPaths(records: readonly FileSystemChangeRecord[]): string[] | null {
  const paths: string[] = [];
  for (const record of records) {
    if (record.type === 'unknown' || record.type === 'errored') return null;
    paths.push(record.relativePathComponents.join('/'));
    if (record.relativePathMovedFrom !== null) paths.push(record.relativePathMovedFrom.join('/'));
  }
  return paths;
}
