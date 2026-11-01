/** One child of a project folder. */
export interface ProjectFileSystemEntry {
  /** File or folder name. */
  name: string;
  /** Whether the child is a file or a folder. */
  kind: 'file' | 'directory';
  /** File size in bytes (files whose stats were wanted). */
  size?: number;
  /** Last modification time in milliseconds (files whose stats were wanted). */
  lastModified?: number;
}

/** How a file system notices changes on disk. */
export type ProjectFileSystemWatchMode = 'observer' | 'poll' | 'none';

/** Paths a native observer reported, or null when it cannot say. */
export type ProjectFileSystemChanged = (paths: readonly string[] | null) => void;

/**
 * A project folder the editor reads and writes through project-relative paths
 * ("walls/brick.png"). Implemented by the browser File System Access API, the
 * desktop app's native file access and a read-only file list.
 */
export interface ProjectFileSystem {
  /** Folder name shown to the user. */
  readonly name: string;
  /** Whether files can be written (autosave, snapshots). */
  readonly writable: boolean;
  /**
   * Whether this file system tells about changes itself, can be polled, or
   * neither.
   */
  watchMode(): ProjectFileSystemWatchMode;
  /**
   * Tells whether the editor may read the folder without asking.
   *
   * @returns Permission state.
   */
  permissionQuery(): Promise<PermissionState>;
  /**
   * Asks for read and write access (needs a user gesture in browsers).
   *
   * @returns True when access was granted.
   */
  permissionRequest(): Promise<boolean>;
  /**
   * Lists the children of a folder.
   *
   * @param path Folder path ("" for the root).
   * @param statWanted Tells for which file names size and time are needed.
   * @returns Children; an empty list when the folder does not exist.
   */
  directoryList(path: string, statWanted: (name: string) => boolean): Promise<ProjectFileSystemEntry[]>;
  /**
   * Reads a file.
   *
   * @param path File path.
   * @returns File contents.
   */
  fileRead(path: string): Promise<File>;
  /**
   * Replaces a file atomically, creating missing folders.
   *
   * @param path File path.
   * @param data New contents.
   */
  fileWrite(path: string, data: string | Blob): Promise<void>;
  /**
   * Deletes a file; a missing file is not an error.
   *
   * @param path File path.
   */
  fileRemove(path: string): Promise<void>;
  /**
   * Starts native change notifications.
   *
   * @param changed Runs with the changed paths.
   * @returns Stops the notifications, or null when there are none.
   */
  observe(changed: ProjectFileSystemChanged): Promise<(() => void) | null>;
}
