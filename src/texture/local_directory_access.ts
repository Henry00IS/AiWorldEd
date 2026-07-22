/**
 * A single file discovered under a user-picked directory.
 */
export interface PickedDirectoryFile {
  name: string;
  relativePath: string;
  file: File;
}

/**
 * Result of a successful directory pick and enumeration.
 */
export interface PickedDirectoryListing {
  folderName: string;
  files: PickedDirectoryFile[];
}

/**
 * Abstraction over browser folder selection APIs.
 * Implementations may use File System Access API or webkitdirectory.
 */
export interface LocalDirectoryAccess {
  /**
   * Returns whether any folder-pick strategy is available.
   * @returns True when the environment can open a folder.
   */
  isSupported(): boolean;

  /**
   * Opens a folder picker and lists files (non-recursive or recursive per impl).
   * @returns Listing, or null when the user cancels.
   */
  pickDirectoryAndListFiles(): Promise<PickedDirectoryListing | null>;
}

/**
 * Chromium File System Access API directory picker with recursive walk.
 */
export class FileSystemAccessDirectoryAccess implements LocalDirectoryAccess {
  /**
   * Returns whether showDirectoryPicker exists on window.
   * @returns True in supporting browsers.
   */
  isSupported(): boolean {
    return typeof window !== 'undefined'
      && typeof window.showDirectoryPicker === 'function';
  }

  /**
   * Shows the native directory picker and walks all nested files.
   * @returns Listing or null on cancel / missing API.
   */
  async pickDirectoryAndListFiles(): Promise<PickedDirectoryListing | null> {
    if (!this.isSupported() || !window.showDirectoryPicker) return null;
    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
      const files = await collectFilesFromDirectoryHandle(directoryHandle, '');
      return { folderName: directoryHandle.name, files };
    } catch {
      return null;
    }
  }
}

/**
 * Fallback using a hidden input with the webkitdirectory attribute.
 */
export class WebkitDirectoryInputAccess implements LocalDirectoryAccess {
  /**
   * Returns whether a file input can be created (always in browser DOM).
   * @returns True when document is available.
   */
  isSupported(): boolean {
    return typeof document !== 'undefined';
  }

  /**
   * Opens a folder file input and maps selected FileList entries.
   * @returns Listing or null when cancelled / empty.
   */
  pickDirectoryAndListFiles(): Promise<PickedDirectoryListing | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
      input.style.display = 'none';
      const cleanup = () => {
        input.remove();
      };
      input.addEventListener('change', () => {
        const listing = buildListingFromFileList(input.files);
        cleanup();
        resolve(listing);
      });
      input.addEventListener('cancel', () => {
        cleanup();
        resolve(null);
      });
      document.body.appendChild(input);
      input.click();
    });
  }
}

/**
 * Prefers File System Access API, then falls back to webkitdirectory.
 */
export class BrowserLocalDirectoryAccess implements LocalDirectoryAccess {
  private primary: FileSystemAccessDirectoryAccess;
  private fallback: WebkitDirectoryInputAccess;

  /**
   * Creates a composite directory access helper.
   */
  constructor() {
    this.primary = new FileSystemAccessDirectoryAccess();
    this.fallback = new WebkitDirectoryInputAccess();
  }

  /**
   * Returns true when either strategy can open a folder.
   * @returns Support flag.
   */
  isSupported(): boolean {
    return this.primary.isSupported() || this.fallback.isSupported();
  }

  /**
   * Picks a directory using the best available strategy.
   * @returns Listing or null on cancel.
   */
  async pickDirectoryAndListFiles(): Promise<PickedDirectoryListing | null> {
    if (this.primary.isSupported()) {
      return this.primary.pickDirectoryAndListFiles();
    }
    return this.fallback.pickDirectoryAndListFiles();
  }
}

/**
 * Recursively collects files under a directory handle.
 * @param directoryHandle Root or nested directory handle.
 * @param pathPrefix Relative path prefix for nested entries.
 * @returns Flat list of files with relative paths.
 */
export async function collectFilesFromDirectoryHandle(
  directoryHandle: FileSystemDirectoryHandle,
  pathPrefix: string
): Promise<PickedDirectoryFile[]> {
  const results: PickedDirectoryFile[] = [];
  for await (const handle of directoryHandle.values()) {
    const relativePath = pathPrefix
      ? `${pathPrefix}/${handle.name}`
      : handle.name;
    if (handle.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      results.push({ name: handle.name, relativePath, file });
      continue;
    }
    if (handle.kind === 'directory') {
      const nested = await collectFilesFromDirectoryHandle(
        handle as FileSystemDirectoryHandle,
        relativePath
      );
      results.push(...nested);
    }
  }
  return results;
}

/**
 * Builds a listing from a FileList produced by webkitdirectory.
 * @param fileList Selected files, or null.
 * @returns Listing with folder name derived from the first path, or null.
 */
export function buildListingFromFileList(
  fileList: FileList | null
): PickedDirectoryListing | null {
  if (!fileList || fileList.length === 0) return null;
  const files: PickedDirectoryFile[] = [];
  for (let index = 0; index < fileList.length; index++) {
    const file = fileList.item(index);
    if (!file) continue;
    const relativePath = resolveRelativePath(file);
    files.push({ name: file.name, relativePath, file });
  }
  if (files.length === 0) return null;
  return {
    folderName: extractRootFolderName(files[0].relativePath),
    files
  };
}

/**
 * Resolves the relative path for a webkitdirectory File.
 * @param file File with optional webkitRelativePath.
 * @returns Relative path string.
 */
function resolveRelativePath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  if (relative && relative.length > 0) return relative;
  return file.name;
}

/**
 * Extracts the top-level folder name from a relative path.
 * @param relativePath Path such as "MyTextures/brick.png".
 * @returns First path segment, or "Folder".
 */
function extractRootFolderName(relativePath: string): string {
  const slash = relativePath.indexOf('/');
  if (slash <= 0) return 'Folder';
  return relativePath.slice(0, slash);
}
