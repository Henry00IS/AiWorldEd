import type { ProjectFileSystem, ProjectFileSystemEntry } from '@/project/fs/project_file_system.js';
import { projectFileKindOf } from '@/project/fs/project_file_kind.js';
import { PROJECT_PATH_DEPTH_MAXIMUM, projectPathJoin } from '@/project/fs/project_path.js';
import { projectSnapshotEmpty, type ProjectSnapshot } from './project_snapshot.js';

/** Most compatible files one scan lists. */
export const PROJECT_SCANNER_FILES_MAXIMUM = 20000;

/** Most folders one scan visits. */
export const PROJECT_SCANNER_DIRECTORIES_MAXIMUM = 4000;

/** Folder names never scanned besides hidden ones (dot names, .aiworlded). */
const PROJECT_SCANNER_SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '__pycache__']);

/** Limits of one scan. */
export interface ProjectScannerLimits {
  files: number;
  directories: number;
  depth: number;
}

/**
 * Walks a project folder breadth-first and lists the compatible files with
 * their size and time. Hidden names (including the editor's own .aiworlded
 * folder) and dependency folders are skipped; caps keep huge trees bounded.
 */
export class ProjectScanner {
  private readonly limits: ProjectScannerLimits;

  /**
   * Creates a scanner.
   *
   * @param limits Caps of one scan.
   */
  constructor(
    limits: ProjectScannerLimits = {
      files: PROJECT_SCANNER_FILES_MAXIMUM,
      directories: PROJECT_SCANNER_DIRECTORIES_MAXIMUM,
      depth: PROJECT_PATH_DEPTH_MAXIMUM,
    },
  ) {
    this.limits = limits;
  }

  /**
   * Scans a project.
   *
   * @param fileSystem Project folder.
   * @returns Snapshot.
   */
  async scan(fileSystem: ProjectFileSystem): Promise<ProjectSnapshot> {
    const snapshot = projectSnapshotEmpty();
    const pending: Array<{ path: string; depth: number }> = [{ path: '', depth: 0 }];
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      const entries = await fileSystem.directoryList(next.path, (name) => projectScannerFileWanted(name));
      const folders = this.entriesAdd(snapshot, next.path, entries);
      if (next.depth < this.limits.depth) folders.forEach((path) => pending.push({ path, depth: next.depth + 1 }));
      else if (folders.length > 0) snapshot.truncated = true;
    }
    return snapshot;
  }

  /**
   * Adds one folder's children to a snapshot.
   *
   * @param snapshot Snapshot being built.
   * @param directory Folder path.
   * @param entries Folder children.
   * @returns Subfolder paths to visit.
   */
  private entriesAdd(
    snapshot: ProjectSnapshot,
    directory: string,
    entries: readonly ProjectFileSystemEntry[],
  ): string[] {
    const folders: string[] = [];
    for (const entry of entries) {
      if (projectScannerHidden(entry.name)) continue;
      const path = projectPathJoin(directory, entry.name);
      if (entry.kind === 'directory') {
        if (this.directoryAdd(snapshot, entry.name, path)) folders.push(path);
      } else this.fileAdd(snapshot, directory, entry, path);
    }
    return folders;
  }

  /**
   * Records a folder unless skipped or over the cap.
   *
   * @param snapshot Snapshot being built.
   * @param name Folder name.
   * @param path Folder path.
   * @returns True when the folder should be visited.
   */
  private directoryAdd(snapshot: ProjectSnapshot, name: string, path: string): boolean {
    if (PROJECT_SCANNER_SKIPPED_DIRECTORIES.has(name)) return false;
    if (snapshot.directories.size >= this.limits.directories) {
      snapshot.truncated = true;
      return false;
    }
    snapshot.directories.add(path);
    return true;
  }

  /**
   * Records a compatible file unless over the cap.
   *
   * @param snapshot Snapshot being built.
   * @param directory Folder path.
   * @param entry File entry.
   * @param path File path.
   */
  private fileAdd(snapshot: ProjectSnapshot, directory: string, entry: ProjectFileSystemEntry, path: string): void {
    const kind = projectFileKindOf(entry.name);
    if (kind === null || entry.size === undefined) return;
    if (snapshot.files.size >= this.limits.files) {
      snapshot.truncated = true;
      return;
    }
    const lastModified = entry.lastModified ?? 0;
    snapshot.files.set(path, { path, name: entry.name, directory, kind, size: entry.size, lastModified });
  }
}

/**
 * Tells whether a file is compatible, so its stats are worth reading.
 *
 * @param name File name.
 * @returns True for compatible, visible files.
 */
export function projectScannerFileWanted(name: string): boolean {
  return !projectScannerHidden(name) && projectFileKindOf(name) !== null;
}

/**
 * Tells whether a name is hidden (starts with a dot).
 *
 * @param name File or folder name.
 * @returns True when hidden.
 */
export function projectScannerHidden(name: string): boolean {
  return name.startsWith('.');
}
