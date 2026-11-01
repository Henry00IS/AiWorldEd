import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import type { ProjectSnapshotDiff } from '@/project/scan/project_snapshot.js';
import {
  PROJECT_WATCHER_POLL_HIDDEN_MS,
  PROJECT_WATCHER_POLL_VISIBLE_MS,
  ProjectWatcher,
  projectWatcherPathHidden,
} from '@/project/watch/project_watcher.js';
import { ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';

/** Fake FileSystemObserver that tests can fire. */
class ProjectWatcherFakeObserver {
  static last: ProjectWatcherFakeObserver | null = null;
  readonly callback: (records: unknown[]) => void;
  disconnected = false;

  /**
   * Creates the observer.
   *
   * @param callback Receives records.
   */
  constructor(callback: (records: unknown[]) => void) {
    this.callback = callback;
    ProjectWatcherFakeObserver.last = this;
  }

  /** Starts observing (no-op). */
  async observe(): Promise<void> {}

  /** Stops observing. */
  disconnect(): void {
    this.disconnected = true;
  }

  /**
   * Reports one modified path.
   *
   * @param path Changed path.
   */
  fire(path: string): void {
    this.callback([{ type: 'modified', relativePathComponents: path.split('/'), relativePathMovedFrom: null }]);
  }
}

/**
 * Creates a watcher over a mock folder that records diffs.
 *
 * @param hidden Tells whether the tab is hidden.
 * @returns Root, watcher and recorded diffs.
 */
function watcherCreate(hidden = () => false) {
  const root = new ProjectMockDirectoryHandle('game');
  root.put('a.png', 'a');
  const diffs: ProjectSnapshotDiff[] = [];
  const watcher = new ProjectWatcher(new ProjectFileSystemHandle(root.asHandle()), (diff) => diffs.push(diff), hidden);
  return { root, watcher, diffs };
}

describe('ProjectWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { FileSystemObserver?: unknown }).FileSystemObserver;
  });

  it('polls and reports adds, changes, removes and renames', async () => {
    const { root, watcher, diffs } = watcherCreate();
    await watcher.start();
    expect(diffs[0]?.added.map((file) => file.path)).toEqual(['a.png']);
    root.put('b.png', 'bb');
    await vi.advanceTimersByTimeAsync(PROJECT_WATCHER_POLL_VISIBLE_MS);
    expect(diffs[1]?.added.map((file) => file.path)).toEqual(['b.png']);
    root.put('a.png', 'changed');
    await vi.advanceTimersByTimeAsync(PROJECT_WATCHER_POLL_VISIBLE_MS);
    expect(diffs[2]?.changed.map((file) => file.path)).toEqual(['a.png']);
    root.move('b.png', 'sub/b.png');
    root.delete('a.png');
    await vi.advanceTimersByTimeAsync(PROJECT_WATCHER_POLL_VISIBLE_MS);
    expect(diffs[3]?.renamed.map((rename) => rename.to.path)).toEqual(['sub/b.png']);
    expect(diffs[3]?.removed.map((file) => file.path)).toEqual(['a.png']);
    watcher.stop();
  });

  it('stays quiet when nothing changed and after stop', async () => {
    const { root, watcher, diffs } = watcherCreate();
    await watcher.start();
    await vi.advanceTimersByTimeAsync(PROJECT_WATCHER_POLL_VISIBLE_MS * 3);
    expect(diffs).toHaveLength(1);
    watcher.stop();
    root.put('c.png', 'c');
    await vi.advanceTimersByTimeAsync(PROJECT_WATCHER_POLL_VISIBLE_MS * 3);
    expect(diffs).toHaveLength(1);
  });

  it('polls slower while the tab is hidden', async () => {
    const { root, watcher, diffs } = watcherCreate(() => true);
    await watcher.start();
    root.put('c.png', 'c');
    await vi.advanceTimersByTimeAsync(PROJECT_WATCHER_POLL_VISIBLE_MS * 2);
    expect(diffs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PROJECT_WATCHER_POLL_HIDDEN_MS);
    expect(diffs).toHaveLength(2);
    watcher.stop();
  });

  it('rescans shortly after an observer notification and ignores hidden paths', async () => {
    (globalThis as { FileSystemObserver?: unknown }).FileSystemObserver = ProjectWatcherFakeObserver;
    const { root, watcher, diffs } = watcherCreate();
    await watcher.start();
    expect(watcher.isObserving()).toBe(true);
    root.put('.aiworlded/autosave/x.json', '{}');
    ProjectWatcherFakeObserver.last?.fire('.aiworlded/autosave/x.json');
    await vi.advanceTimersByTimeAsync(1500);
    expect(diffs).toHaveLength(1);
    root.put('d.png', 'd');
    ProjectWatcherFakeObserver.last?.fire('d.png');
    await vi.advanceTimersByTimeAsync(1100);
    expect(diffs[1]?.added.map((file) => file.path)).toEqual(['d.png']);
    watcher.stop();
    expect(ProjectWatcherFakeObserver.last?.disconnected).toBe(true);
  });

  it('reports scan errors without stopping', async () => {
    const { root, watcher } = watcherCreate();
    const errors: unknown[] = [];
    watcher.errorListenerSet((error) => errors.push(error));
    root.values = () => {
      throw new Error('gone');
    };
    await watcher.start();
    expect(errors).toHaveLength(1);
    watcher.stop();
  });

  it('treats dot folders as hidden', () => {
    expect(projectWatcherPathHidden('.aiworlded/autosave/a.json')).toBe(true);
    expect(projectWatcherPathHidden('textures/a.png')).toBe(false);
  });
});
