import type { ProjectFileKind } from '@/project/fs/project_file_kind.js';
import type { ProjectSnapshot } from '@/project/scan/project_snapshot.js';

/**
 * Builds a snapshot from file paths; folders are derived from the paths.
 *
 * @param paths File paths.
 * @returns Snapshot.
 */
export function panelProjectSnapshotOf(paths: readonly string[]): ProjectSnapshot {
  const snapshot: ProjectSnapshot = { files: new Map(), directories: new Set(), truncated: false };
  for (const path of paths) {
    const slash = path.lastIndexOf('/');
    const directory = slash < 0 ? '' : path.slice(0, slash);
    const name = path.slice(slash + 1);
    snapshot.files.set(path, { path, name, directory, kind: panelProjectKindOf(name), size: 10, lastModified: 1 });
    const segments = directory.split('/').filter(Boolean);
    segments.forEach((_, index) => snapshot.directories.add(segments.slice(0, index + 1).join('/')));
  }
  return snapshot;
}

/**
 * Guesses the file kind from the extension.
 *
 * @param name File name.
 * @returns Kind.
 */
function panelProjectKindOf(name: string): ProjectFileKind {
  if (name.endsWith('.json')) return 'scene';
  if (name.endsWith('.vmf')) return 'vmf';
  if (name.endsWith('.obj')) return 'obj';
  return 'texture';
}
