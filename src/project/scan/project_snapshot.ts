import type { ProjectFileKind } from '@/project/fs/project_file_kind.js';

/** One compatible file found in the project. */
export interface ProjectFileRecord {
  /** Project-relative path, also the texture id of images. */
  path: string;
  /** File name. */
  name: string;
  /** Folder path ("" for the root). */
  directory: string;
  /** What the editor can do with the file. */
  kind: ProjectFileKind;
  /** Size in bytes. */
  size: number;
  /** Last modification time in milliseconds. */
  lastModified: number;
}

/** The compatible files and the folders of a project at one moment. */
export interface ProjectSnapshot {
  /** Files by path. */
  files: Map<string, ProjectFileRecord>;
  /** Folder paths, without the root. */
  directories: Set<string>;
  /** True when a cap stopped the scan early. */
  truncated: boolean;
}

/** A file that moved: same size, time and kind under another path. */
export interface ProjectFileRename {
  from: ProjectFileRecord;
  to: ProjectFileRecord;
}

/** What changed between two snapshots. */
export interface ProjectSnapshotDiff {
  added: ProjectFileRecord[];
  changed: ProjectFileRecord[];
  removed: ProjectFileRecord[];
  renamed: ProjectFileRename[];
  /** True when the folder set changed. */
  directoriesChanged: boolean;
}

/**
 * Creates an empty snapshot.
 *
 * @returns Snapshot without files or folders.
 */
export function projectSnapshotEmpty(): ProjectSnapshot {
  return { files: new Map(), directories: new Set(), truncated: false };
}

/**
 * Tells whether a diff holds no change at all.
 *
 * @param diff Diff.
 * @returns True when nothing changed.
 */
export function projectSnapshotDiffEmpty(diff: ProjectSnapshotDiff): boolean {
  return (
    !diff.directoriesChanged &&
    diff.added.length + diff.changed.length + diff.removed.length + diff.renamed.length === 0
  );
}
