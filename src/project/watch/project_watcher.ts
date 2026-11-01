import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectScannerHidden, ProjectScanner } from '@/project/scan/project_scanner.js';
import {
  projectSnapshotDiffEmpty,
  projectSnapshotEmpty,
  type ProjectSnapshot,
  type ProjectSnapshotDiff,
} from '@/project/scan/project_snapshot.js';
import { projectSnapshotDiff } from '@/project/scan/project_snapshot_diff.js';

/** Poll interval while the tab is visible. */
export const PROJECT_WATCHER_POLL_VISIBLE_MS = 2000;

/** Poll interval while the tab is hidden. */
export const PROJECT_WATCHER_POLL_HIDDEN_MS = 15000;

/** Safety rescan interval while a native observer reports changes. */
export const PROJECT_WATCHER_OBSERVER_SAFETY_MS = 30000;

/** Delay that merges a burst of observer notifications into one rescan. */
export const PROJECT_WATCHER_OBSERVER_DEBOUNCE_MS = 250;

/** Shortest gap between two scans. */
export const PROJECT_WATCHER_SCAN_GAP_MS = 1000;

/** How many scan durations a poll waits at least, so huge trees poll slower. */
const PROJECT_WATCHER_SCAN_COST_FACTOR = 4;

/** Receives each non-empty change with the new snapshot. */
export type ProjectWatcherListener = (diff: ProjectSnapshotDiff, snapshot: ProjectSnapshot) => void;

/** Receives scan failures (folder gone, permission revoked). */
export type ProjectWatcherErrorListener = (error: unknown) => void;

/** Tells whether the page is hidden. */
export type ProjectWatcherHidden = () => boolean;

/**
 * Keeps a snapshot of a project current: a native FileSystemObserver (with a
 * slow safety rescan) where the browser has one, otherwise polling that
 * compares names, sizes and times every 2 s (15 s while the tab is hidden, and
 * never more often than a few scan durations). Scans never overlap.
 */
export class ProjectWatcher {
  private readonly fileSystem: ProjectFileSystem;
  private readonly scanner: ProjectScanner;
  private readonly listener: ProjectWatcherListener;
  private readonly hidden: ProjectWatcherHidden;
  private errorListener: ProjectWatcherErrorListener;
  private current: ProjectSnapshot;
  private timer: ReturnType<typeof setTimeout> | null;
  private scanning: Promise<void> | null;
  private scanAgain: boolean;
  private scanMs: number;
  private scannedAt: number;
  private unobserve: (() => void) | null;
  private observing: boolean;
  private stopped: boolean;
  private readonly visibilityChanged: () => void;

  /**
   * Creates a watcher; {@link start} runs the first scan.
   *
   * @param fileSystem Project folder.
   * @param listener Receives changes.
   * @param hidden Tells whether the tab is hidden.
   * @param scanner Scanner.
   */
  constructor(
    fileSystem: ProjectFileSystem,
    listener: ProjectWatcherListener,
    hidden: ProjectWatcherHidden = projectWatcherDocumentHidden,
    scanner: ProjectScanner = new ProjectScanner(),
  ) {
    this.fileSystem = fileSystem;
    this.scanner = scanner;
    this.listener = listener;
    this.hidden = hidden;
    this.errorListener = () => undefined;
    this.current = projectSnapshotEmpty();
    this.timer = null;
    this.scanning = null;
    this.scanAgain = false;
    this.scanMs = 0;
    this.scannedAt = -Infinity;
    this.unobserve = null;
    this.observing = false;
    this.stopped = false;
    this.visibilityChanged = () => this.visibilityFollow();
  }

  /**
   * Sets the scan failure listener.
   *
   * @param listener Receives errors.
   */
  errorListenerSet(listener: ProjectWatcherErrorListener): void {
    this.errorListener = listener;
  }

  /**
   * Returns the latest snapshot.
   *
   * @returns Snapshot.
   */
  snapshot(): ProjectSnapshot {
    return this.current;
  }

  /**
   * Returns how long the last scan took.
   *
   * @returns Milliseconds.
   */
  lastScanMs(): number {
    return this.scanMs;
  }

  /**
   * Tells whether a native observer reports changes.
   *
   * @returns True when observing.
   */
  isObserving(): boolean {
    return this.observing;
  }

  /** Scans once, then follows changes. */
  async start(): Promise<void> {
    await this.rescan();
    if (this.stopped) return;
    await this.observeStart();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityChanged);
    this.scheduleNext();
  }

  /** Stops following changes. */
  stop(): void {
    this.stopped = true;
    this.unobserve?.();
    this.unobserve = null;
    this.timerClear();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityChanged);
  }

  /**
   * Scans now (or right after a running scan) and reports the change.
   *
   * @returns Resolves after the scan.
   */
  rescan(): Promise<void> {
    if (this.scanning !== null) {
      this.scanAgain = true;
      return this.scanning;
    }
    this.scanning = this.scanRun().finally(() => {
      this.scanning = null;
      if (this.scanAgain && !this.stopped) {
        this.scanAgain = false;
        void this.rescan();
      }
    });
    return this.scanning;
  }

  /** Runs one scan and reports its diff. */
  private async scanRun(): Promise<void> {
    const startedAt = Date.now();
    try {
      const next = await this.scanner.scan(this.fileSystem);
      this.scanMs = Date.now() - startedAt;
      this.scannedAt = Date.now();
      if (!this.stopped) this.snapshotAccept(next);
    } catch (error) {
      this.scannedAt = Date.now();
      if (!this.stopped) this.errorListener(error);
    }
  }

  /**
   * Replaces the snapshot and reports a non-empty diff.
   *
   * @param next New snapshot.
   */
  private snapshotAccept(next: ProjectSnapshot): void {
    const diff = projectSnapshotDiff(this.current, next);
    this.current = next;
    if (!projectSnapshotDiffEmpty(diff)) this.listener(diff, next);
  }

  /** Connects the native observer where available. */
  private async observeStart(): Promise<void> {
    if (this.fileSystem.watchMode() !== 'observer') return;
    this.unobserve = await this.fileSystem.observe((paths) => this.observed(paths));
    this.observing = this.unobserve !== null;
  }

  /**
   * Schedules a rescan for observer notifications outside hidden folders.
   *
   * @param paths Changed paths, or null when unknown.
   */
  private observed(paths: readonly string[] | null): void {
    if (paths !== null && paths.every(projectWatcherPathHidden)) return;
    const wait = Math.max(
      PROJECT_WATCHER_OBSERVER_DEBOUNCE_MS,
      this.scannedAt + PROJECT_WATCHER_SCAN_GAP_MS - Date.now(),
    );
    this.timerSet(wait);
  }

  /** Schedules the next poll or safety rescan. */
  private scheduleNext(): void {
    if (this.stopped) return;
    const mode = this.fileSystem.watchMode();
    if (mode === 'none') return;
    const base = this.observing ? PROJECT_WATCHER_OBSERVER_SAFETY_MS : PROJECT_WATCHER_POLL_VISIBLE_MS;
    const interval = this.hidden() ? Math.max(base, PROJECT_WATCHER_POLL_HIDDEN_MS) : base;
    this.timerSet(Math.max(interval, this.scanMs * PROJECT_WATCHER_SCAN_COST_FACTOR));
  }

  /**
   * Replaces the pending timer.
   *
   * @param wait Milliseconds until the rescan.
   */
  private timerSet(wait: number): void {
    this.timerClear();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.rescan().then(() => this.scheduleNext());
    }, wait);
  }

  /** Cancels the pending timer. */
  private timerClear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Rescans soon after the tab becomes visible, and slows down when hidden. */
  private visibilityFollow(): void {
    if (this.stopped || this.fileSystem.watchMode() === 'none') return;
    if (this.hidden()) this.scheduleNext();
    else this.timerSet(PROJECT_WATCHER_OBSERVER_DEBOUNCE_MS);
  }
}

/**
 * Tells whether the document is hidden.
 *
 * @returns True when hidden.
 */
export function projectWatcherDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Tells whether a changed path lies in a hidden file or folder.
 *
 * @param path Project-relative path.
 * @returns True when one segment is hidden.
 */
export function projectWatcherPathHidden(path: string): boolean {
  return path.split('/').some(projectScannerHidden);
}
