import type { ProjectFileRecord, ProjectFileRename, ProjectSnapshot, ProjectSnapshotDiff } from './project_snapshot.js';

/**
 * Compares two snapshots by path, size and modification time. A removed file
 * and an added file with the same kind, size and time (and no other file
 * sharing them) count as a rename.
 *
 * @param before Older snapshot.
 * @param after Newer snapshot.
 * @returns Diff.
 */
export function projectSnapshotDiff(before: ProjectSnapshot, after: ProjectSnapshot): ProjectSnapshotDiff {
  const added: ProjectFileRecord[] = [];
  const changed: ProjectFileRecord[] = [];
  after.files.forEach((record, path) => {
    const old = before.files.get(path);
    if (old === undefined) added.push(record);
    else if (old.size !== record.size || old.lastModified !== record.lastModified) changed.push(record);
  });
  const removed = [...before.files.values()].filter((record) => !after.files.has(record.path));
  const renamed = projectSnapshotRenames(added, removed);
  const moved = new Set(renamed.flatMap((rename) => [rename.from, rename.to]));
  return {
    added: added.filter((record) => !moved.has(record)),
    changed,
    removed: removed.filter((record) => !moved.has(record)),
    renamed,
    directoriesChanged: !projectSnapshotSetsEqual(before.directories, after.directories),
  };
}

/**
 * Pairs removed and added files that share a unique kind, size and time.
 *
 * @param added Added files.
 * @param removed Removed files.
 * @returns Renames.
 */
function projectSnapshotRenames(
  added: readonly ProjectFileRecord[],
  removed: readonly ProjectFileRecord[],
): ProjectFileRename[] {
  if (added.length === 0 || removed.length === 0) return [];
  const addedByKey = projectSnapshotUniqueByKey(added);
  const removedByKey = projectSnapshotUniqueByKey(removed);
  const renames: ProjectFileRename[] = [];
  removedByKey.forEach((from, key) => {
    const to = addedByKey.get(key);
    if (from !== null && to !== undefined && to !== null) renames.push({ from, to });
  });
  return renames;
}

/**
 * Indexes files by kind, size and time; keys shared by several files map to
 * null so they never pair.
 *
 * @param records Files.
 * @returns File per key, or null when ambiguous.
 */
function projectSnapshotUniqueByKey(records: readonly ProjectFileRecord[]): Map<string, ProjectFileRecord | null> {
  const byKey = new Map<string, ProjectFileRecord | null>();
  records.forEach((record) => {
    const key = `${record.kind}:${record.size}:${record.lastModified}`;
    byKey.set(key, byKey.has(key) ? null : record);
  });
  return byKey;
}

/**
 * Tells whether two sets hold the same values.
 *
 * @param left First set.
 * @param right Second set.
 * @returns True when equal.
 */
function projectSnapshotSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}
