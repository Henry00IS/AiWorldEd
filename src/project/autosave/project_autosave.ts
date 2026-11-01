import type { SceneJSON } from '@/io/scene/io_types.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectPathJoin } from '@/project/fs/project_path.js';
import {
  PROJECT_AUTOSAVE_FORMAT,
  projectAutosaveHistoryFolder,
  projectAutosaveHistoryName,
  projectAutosaveHistoryPrune,
  projectAutosaveKey,
  projectAutosavePath,
  type ProjectAutosaveDocument,
} from './project_autosave_files.js';

/** Quiet time after the last change before an autosave is written. */
export const PROJECT_AUTOSAVE_DELAY_MS = 3000;

/** Shortest time between two autosave writes. */
export const PROJECT_AUTOSAVE_INTERVAL_MS = 15000;

/** Shortest time between two rotated copies. */
export const PROJECT_AUTOSAVE_HISTORY_INTERVAL_MS = 120000;

/** Scene contents captured for an autosave. */
export interface ProjectAutosaveCapture {
  data: SceneJSON;
  objectCount: number;
}

/** Timing of the last autosave, for the status line and tests. */
export interface ProjectAutosaveMetrics {
  writes: number;
  lastCaptureMs: number;
  lastWriteMs: number;
  lastBytes: number;
  lastError: string | null;
}

/**
 * Minimum interval as a multiple of the last capture time, so big scenes spend
 * at most about 1/15 of the time saving.
 */
export const PROJECT_AUTOSAVE_COST_FACTOR = 15;

/** Services the autosave needs. */
export interface ProjectAutosaveDependencies {
  fileSystem: () => ProjectFileSystem | null;
  capture: () => ProjectAutosaveCapture;
  now?: () => number;
  idle?: (run: () => void) => void;
  saved?: (document: ProjectAutosaveDocument, metrics: ProjectAutosaveMetrics) => void;
}

/**
 * Writes the scene into the project folder a few seconds after changes stop, at
 * most every {@link PROJECT_AUTOSAVE_INTERVAL_MS}, and keeps rotated copies.
 * Costs nothing while no writable project is open.
 */
export class ProjectAutosave {
  private readonly deps: ProjectAutosaveDependencies;
  private readonly now: () => number;
  private sourcePath: string | null;
  private dirty: boolean;
  private writing: boolean;
  private timer: ReturnType<typeof setTimeout> | null;
  private lastWrite: number;
  private lastHistory: number;
  private readonly stats: ProjectAutosaveMetrics;

  /**
   * Creates an idle autosave.
   *
   * @param deps Project, capture and timing services.
   */
  constructor(deps: ProjectAutosaveDependencies) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
    this.sourcePath = null;
    this.dirty = false;
    this.writing = false;
    this.timer = null;
    this.lastWrite = -Infinity;
    this.lastHistory = -Infinity;
    this.stats = { writes: 0, lastCaptureMs: 0, lastWriteMs: 0, lastBytes: 0, lastError: null };
  }

  /**
   * Returns write counts and timings.
   *
   * @returns Metrics snapshot.
   */
  metrics(): ProjectAutosaveMetrics {
    return { ...this.stats };
  }

  /**
   * Returns the project path of the scene being autosaved.
   *
   * @returns Scene path, or null when untitled.
   */
  scenePath(): string | null {
    return this.sourcePath;
  }

  /**
   * Starts autosaving a different scene; pending changes of the old one are
   * dropped because the scene was replaced.
   *
   * @param sourcePath Scene path in the project, or null when untitled.
   */
  sceneSet(sourcePath: string | null): void {
    this.sourcePath = sourcePath;
    this.dirty = false;
    this.lastHistory = -Infinity;
    this.timerClear();
  }

  /** Marks the scene changed and schedules a write when a project is open. */
  changed(): void {
    const fileSystem = this.deps.fileSystem();
    if (fileSystem === null || !fileSystem.writable) return;
    this.dirty = true;
    if (this.timer === null && !this.writing) this.schedule();
  }

  /**
   * Writes pending changes now (page hide, project close).
   *
   * @returns Resolves after the write.
   */
  async flush(): Promise<void> {
    this.timerClear();
    if (this.dirty && !this.writing) await this.write();
  }

  /** Cancels any pending write. */
  dispose(): void {
    this.timerClear();
    this.dirty = false;
  }

  /**
   * Waits for quiet time and the minimum interval (longer for scenes that take
   * long to capture), then writes when idle.
   */
  private schedule(): void {
    const interval = Math.max(PROJECT_AUTOSAVE_INTERVAL_MS, this.stats.lastCaptureMs * PROJECT_AUTOSAVE_COST_FACTOR);
    const wait = Math.max(PROJECT_AUTOSAVE_DELAY_MS, this.lastWrite + interval - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      (this.deps.idle ?? projectAutosaveIdle)(() => void this.write());
    }, wait);
  }

  /** Captures the scene and writes the autosave and, when due, a copy. */
  private async write(): Promise<void> {
    const fileSystem = this.deps.fileSystem();
    if (fileSystem === null || !fileSystem.writable || !this.dirty || this.writing) return;
    this.writing = true;
    this.dirty = false;
    try {
      await this.writeTo(fileSystem);
      this.stats.lastError = null;
    } catch (error) {
      this.stats.lastError = error instanceof Error ? error.message : String(error);
      this.dirty = true;
    } finally {
      this.writing = false;
      this.lastWrite = this.now();
      if (this.dirty && this.timer === null) this.schedule();
    }
  }

  /**
   * Writes one autosave into the given project.
   *
   * @param fileSystem Project file system.
   */
  private async writeTo(fileSystem: ProjectFileSystem): Promise<void> {
    const started = performance.now();
    const capture = this.deps.capture();
    const key = projectAutosaveKey(this.sourcePath);
    const document: ProjectAutosaveDocument = {
      format: PROJECT_AUTOSAVE_FORMAT,
      version: 1,
      scene: key,
      sourcePath: this.sourcePath,
      savedAt: this.now(),
      objectCount: capture.objectCount,
      data: capture.data,
    };
    const text = JSON.stringify(document);
    this.stats.lastCaptureMs = performance.now() - started;
    await fileSystem.fileWrite(projectAutosavePath(key), text);
    await this.historyWrite(fileSystem, key, text, document.savedAt);
    this.stats.lastWriteMs = performance.now() - started;
    this.stats.lastBytes = text.length;
    this.stats.writes += 1;
    this.deps.saved?.(document, this.metrics());
  }

  /**
   * Writes a rotated copy when due and deletes copies past retention.
   *
   * @param fileSystem Project file system.
   * @param key Scene key.
   * @param text Autosave contents.
   * @param time Save time.
   */
  private async historyWrite(fileSystem: ProjectFileSystem, key: string, text: string, time: number): Promise<void> {
    if (time - this.lastHistory < PROJECT_AUTOSAVE_HISTORY_INTERVAL_MS) return;
    this.lastHistory = time;
    const folder = projectAutosaveHistoryFolder(key);
    await fileSystem.fileWrite(projectPathJoin(folder, projectAutosaveHistoryName(time)), text);
    const names = (await fileSystem.directoryList(folder, () => false)).map((entry) => entry.name);
    for (const name of projectAutosaveHistoryPrune(names, time)) {
      await fileSystem.fileRemove(projectPathJoin(folder, name));
    }
  }

  /** Clears the pending write timer. */
  private timerClear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * Runs work when the browser is idle, within two seconds at the latest.
 *
 * @param run Work to run.
 */
export function projectAutosaveIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 2000 });
  else setTimeout(run, 0);
}
