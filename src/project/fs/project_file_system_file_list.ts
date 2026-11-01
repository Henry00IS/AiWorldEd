import type { PickedDirectoryListing } from '@/texture/library/local_directory_access.js';
import type { ProjectFileSystem, ProjectFileSystemEntry, ProjectFileSystemWatchMode } from './project_file_system.js';
import { projectPathName, projectPathParent, projectPathSegmentSafe } from './project_path.js';

/**
 * Read-only project folder built from files picked through a folder input
 * (Firefox, Safari): the listing is fixed at pick time, nothing is watched and
 * nothing can be written.
 */
export class ProjectFileSystemFileList implements ProjectFileSystem {
  readonly name: string;
  readonly writable = false;
  private readonly files: Map<string, File>;
  private readonly children: Map<string, Map<string, ProjectFileSystemEntry>>;

  /**
   * Indexes a picked listing; paths lose the leading folder name so they match
   * the File System Access form.
   *
   * @param listing Picked folder listing.
   */
  constructor(listing: PickedDirectoryListing) {
    this.name = listing.folderName;
    this.files = new Map();
    this.children = new Map([['', new Map()]]);
    listing.files.forEach((picked) => this.fileAdd(projectFileListPathStrip(picked.relativePath), picked.file));
  }

  /**
   * Returns "none": a picked listing never changes.
   *
   * @returns Watch mode.
   */
  watchMode(): ProjectFileSystemWatchMode {
    return 'none';
  }

  /**
   * Returns "granted": the files were already handed over.
   *
   * @returns Permission state.
   */
  async permissionQuery(): Promise<PermissionState> {
    return 'granted';
  }

  /**
   * Returns true: the files were already handed over.
   *
   * @returns True.
   */
  async permissionRequest(): Promise<boolean> {
    return true;
  }

  /**
   * Lists a folder's children.
   *
   * @param path Folder path.
   * @returns Children.
   */
  async directoryList(path: string): Promise<ProjectFileSystemEntry[]> {
    return [...(this.children.get(path)?.values() ?? [])];
  }

  /**
   * Returns a picked file.
   *
   * @param path File path.
   * @returns File.
   */
  async fileRead(path: string): Promise<File> {
    const file = this.files.get(path);
    if (file === undefined) throw new Error(`Missing file ${path}`);
    return file;
  }

  /** Rejects: a picked listing is read-only. */
  async fileWrite(): Promise<void> {
    throw new Error('This folder was opened read-only');
  }

  /** Rejects: a picked listing is read-only. */
  async fileRemove(): Promise<void> {
    throw new Error('This folder was opened read-only');
  }

  /**
   * Returns null: a picked listing never changes.
   *
   * @returns Null.
   */
  async observe(): Promise<null> {
    return null;
  }

  /**
   * Adds one file and the folders above it.
   *
   * @param path File path.
   * @param file File.
   */
  private fileAdd(path: string, file: File): void {
    if (path === '' || !path.split('/').every(projectPathSegmentSafe)) return;
    this.files.set(path, file);
    this.childAdd(projectPathParent(path), {
      name: projectPathName(path),
      kind: 'file',
      size: file.size,
      lastModified: file.lastModified,
    });
  }

  /**
   * Adds a child to a folder, creating the folder chain above it.
   *
   * @param directory Folder path.
   * @param entry Child.
   */
  private childAdd(directory: string, entry: ProjectFileSystemEntry): void {
    let children = this.children.get(directory);
    if (children === undefined) {
      children = new Map();
      this.children.set(directory, children);
      this.childAdd(projectPathParent(directory), { name: projectPathName(directory), kind: 'directory' });
    }
    children.set(entry.name, entry);
  }
}

/**
 * Drops the picked folder's own name from a webkitRelativePath.
 *
 * @param relativePath Path such as "Project/walls/brick.png".
 * @returns Path such as "walls/brick.png".
 */
export function projectFileListPathStrip(relativePath: string): string {
  const slash = relativePath.indexOf('/');
  return slash < 0 ? relativePath : relativePath.slice(slash + 1);
}
