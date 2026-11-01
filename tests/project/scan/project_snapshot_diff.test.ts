import { describe, expect, it } from 'vitest';
import { projectSnapshotEmpty, type ProjectFileRecord, type ProjectSnapshot } from '@/project/scan/project_snapshot.js';
import { projectSnapshotDiff } from '@/project/scan/project_snapshot_diff.js';

/**
 * Builds a snapshot from records.
 *
 * @param records File records.
 * @returns Snapshot.
 */
function snapshotOf(...records: ProjectFileRecord[]): ProjectSnapshot {
  const snapshot = projectSnapshotEmpty();
  records.forEach((record) => snapshot.files.set(record.path, record));
  records.forEach((record) => record.directory !== '' && snapshot.directories.add(record.directory));
  return snapshot;
}

/**
 * Builds a texture record.
 *
 * @param path Path.
 * @param size Size.
 * @param lastModified Time.
 * @returns Record.
 */
function record(path: string, size: number, lastModified: number): ProjectFileRecord {
  const slash = path.lastIndexOf('/');
  return {
    path,
    name: path.slice(slash + 1),
    directory: slash < 0 ? '' : path.slice(0, slash),
    kind: 'texture',
    size,
    lastModified,
  };
}

describe('projectSnapshotDiff', () => {
  it('reports added, changed and removed files', () => {
    const before = snapshotOf(record('a.png', 1, 1), record('b.png', 2, 2));
    const after = snapshotOf(record('a.png', 1, 9), record('c.png', 3, 3));
    const diff = projectSnapshotDiff(before, after);
    expect(diff.added.map((file) => file.path)).toEqual(['c.png']);
    expect(diff.changed.map((file) => file.path)).toEqual(['a.png']);
    expect(diff.removed.map((file) => file.path)).toEqual(['b.png']);
    expect(diff.renamed).toEqual([]);
  });

  it('pairs a unique remove and add with the same size and time as a rename', () => {
    const before = snapshotOf(record('old/a.png', 5, 7));
    const after = snapshotOf(record('new/a.png', 5, 7));
    const diff = projectSnapshotDiff(before, after);
    expect(diff.renamed.map((rename) => [rename.from.path, rename.to.path])).toEqual([['old/a.png', 'new/a.png']]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.directoriesChanged).toBe(true);
  });

  it('does not guess a rename when two candidates match', () => {
    const before = snapshotOf(record('a.png', 5, 7), record('b.png', 5, 7));
    const after = snapshotOf(record('c.png', 5, 7));
    const diff = projectSnapshotDiff(before, after);
    expect(diff.renamed).toEqual([]);
    expect(diff.removed).toHaveLength(2);
  });
});
