/**
 * Minimal typings for the File System Access API used by the texture browser.
 * Chromium browsers implement these; other engines may lack them at runtime.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';
  values(): AsyncIterableIterator<FileSystemHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface Window {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}

/** One change reported by a FileSystemObserver (Chromium 129+). */
interface FileSystemChangeRecord {
  readonly type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
  readonly relativePathComponents: readonly string[];
  readonly relativePathMovedFrom: readonly string[] | null;
}

/** Observes a folder for changes (Chromium 129+). */
interface FileSystemObserverInstance {
  observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
  disconnect(): void;
}

/** Constructor of FileSystemObserver (Chromium 129+). */
type FileSystemObserverConstructor = new (
  callback: (records: readonly FileSystemChangeRecord[], observer: FileSystemObserverInstance) => void,
) => FileSystemObserverInstance;
