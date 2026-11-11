import type { SceneJSON } from '@/io/scene/io_types.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import {
  projectHistorySaveKind,
  projectHistoryTitle,
  type ProjectHistoryEntry,
  type ProjectHistoryEntryKind,
} from '@/project/history/core/project_history_entry.js';
import { projectHistoryObjectCount } from '@/project/history/core/project_history_object_count.js';
import {
  projectHistoryStoreFor,
  type ProjectHistoryRecord,
  type ProjectHistoryThumbnailCapture,
} from '@/project/history/core/project_history_store.js';
import { projectTextureCacheKeep } from '@/project/textures/cache/project_texture_cache.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { PROJECT_AUTOSAVE_FORMAT, projectAutosaveKey, type ProjectAutosaveDocument } from './project_autosave_files.js';

/** Quiet time after the last change before an autosave is written. */
export const PROJECT_AUTOSAVE_DELAY_MS = 3000;

/** Shortest time between two autosave writes. */
export const PROJECT_AUTOSAVE_INTERVAL_MS = 15000;

/** Scene contents captured for an autosave. */
export interface ProjectAutosaveCapture {
  data: SceneJSON;
}

/** Timing of the last autosave, for the status line and tests. */
export interface ProjectAutosaveMetrics {
  writes: number;
  /** Writes left out because the scene had not changed since the last one. */
  skipped: number;
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
  /**
   * Library holding the embedded textures the scene uses; they are copied into
   * the texture cache.
   */
  library?: () => TextureLibrary | null;
  /**
   * File name of the active save file (the one Ctrl+S saves to), or null when
   * the level has none.
   */
  title?: (() => string | null) | undefined;
  /** Takes the thumbnail of a saved state. */
  thumbnail?: ProjectHistoryThumbnailCapture | undefined;
  /** Counter that changes with every edit, undo and redo. */
  revision?: (() => number) | undefined;
  /**
   * Identity of the edit the scene stands at (the same value again after undo
   * returns to it), or undefined when unknown.
   */
  state?: (() => unknown) | undefined;
  now?: () => number;
  idle?: (run: () => void) => void;
  saved?: (document: ProjectAutosaveDocument, metrics: ProjectAutosaveMetrics) => void;
}

/** Revision and state of the last saved scene. */
interface ProjectAutosaveSavedMark {
  revision: number | undefined;
  state: unknown;
}

/**
 * Saves the scene into the project's Level History a few seconds after changes
 * stop, at most every {@link PROJECT_AUTOSAVE_INTERVAL_MS}, one write at a time.
 * A scene that did not change since the last write is not written again; a
 * write 30 minutes after the last snapshot is a snapshot, the rest are
 * autosaves. Costs nothing while no writable project is open.
 */
export class ProjectAutosave {
  private readonly deps: ProjectAutosaveDependencies;
  private readonly now: () => number;
  private sourcePath: string | null;
  private dirty: boolean;
  private writing: Promise<void> | null;
  private timer: ReturnType<typeof setTimeout> | null;
  private lastWrite: number;
  private savedMark: ProjectAutosaveSavedMark | null;
  private lastSnapshot: number;
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
    this.writing = null;
    this.timer = null;
    this.lastWrite = -Infinity;
    this.savedMark = null;
    this.lastSnapshot = this.now();
    this.stats = { writes: 0, skipped: 0, lastCaptureMs: 0, lastWriteMs: 0, lastBytes: 0, lastError: null };
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
   * Tells whether changes wait for the next autosave.
   *
   * @returns True while changes are not written yet.
   */
  pending(): boolean {
    return this.dirty;
  }

  /**
   * Starts autosaving a different scene; pending changes of the old one are
   * dropped because the scene was replaced, and its 30 minutes start now.
   *
   * @param sourcePath Scene path in the project, or null when untitled.
   */
  sceneSet(sourcePath: string | null): void {
    this.sourcePath = sourcePath;
    this.dirty = false;
    this.savedMark = null;
    this.lastSnapshot = this.now();
    this.timerClear();
  }

  /**
   * Marks the scene as it is now as already saved (it was just loaded from a
   * saved state), so no autosave repeats it.
   */
  savedMarkSet(): void {
    this.savedMark = this.markCurrent();
    this.dirty = false;
    this.timerClear();
  }

  /** Marks the scene changed and schedules a write when a project is open. */
  changed(): void {
    const fileSystem = this.deps.fileSystem();
    if (fileSystem === null || !fileSystem.writable) return;
    this.dirty = true;
    if (this.timer === null && this.writing === null) this.schedule();
  }

  /**
   * Writes pending changes now (page hide, project close, before a restore),
   * after a write that is already running.
   *
   * @returns Resolves after the write.
   */
  async flush(): Promise<void> {
    this.timerClear();
    if (this.writing !== null) await this.writing;
    if (this.dirty) await this.write();
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

  /**
   * Writes pending changes unless another write runs.
   *
   * @returns Resolves after the write.
   */
  private write(): Promise<void> {
    if (this.writing !== null) return this.writing;
    const fileSystem = this.deps.fileSystem();
    if (fileSystem === null || !fileSystem.writable || !this.dirty) return Promise.resolve();
    this.writing = this.writeRun(fileSystem).finally(() => {
      this.writing = null;
      this.lastWrite = this.now();
      if (this.dirty && this.timer === null) this.schedule();
    });
    return this.writing;
  }

  /**
   * Writes one autosave unless the scene did not change since the last one.
   *
   * @param fileSystem Project file system.
   */
  private async writeRun(fileSystem: ProjectFileSystem): Promise<void> {
    this.dirty = false;
    if (this.unchanged()) {
      this.stats.skipped += 1;
      return;
    }
    const mark = this.markCurrent();
    try {
      await this.writeTo(fileSystem);
      this.savedMark = mark;
      this.stats.lastError = null;
    } catch (error) {
      this.stats.lastError = error instanceof Error ? error.message : String(error);
      this.dirty = true;
    }
  }

  /**
   * Tells in constant time whether the scene is still the one last saved: the
   * edit counter did not move, or the scene stands at the same edit again.
   *
   * @returns True when nothing needs writing.
   */
  private unchanged(): boolean {
    const saved = this.savedMark;
    if (saved === null) return false;
    const current = this.markCurrent();
    if (current.revision !== undefined && current.revision === saved.revision) return true;
    return current.state !== undefined && current.state === saved.state;
  }

  /**
   * Reads the revision and state of the scene now.
   *
   * @returns Mark.
   */
  private markCurrent(): ProjectAutosaveSavedMark {
    return { revision: this.deps.revision?.(), state: this.deps.state?.() };
  }

  /**
   * Captures the scene and records it into the Level History, after copying the
   * embedded textures it uses into the project's texture cache.
   *
   * @param fileSystem Project file system.
   */
  private async writeTo(fileSystem: ProjectFileSystem): Promise<void> {
    const started = performance.now();
    const { record, document, data } = this.recordCreate(projectHistorySaveKind(this.now(), this.lastSnapshot));
    this.stats.lastCaptureMs = performance.now() - started;
    await this.recordWrite(fileSystem, record, data);
    if (record.kind === 'snapshot') this.lastSnapshot = record.time;
    this.stats.lastWriteMs = performance.now() - started;
    this.stats.lastBytes = record.state.length;
    this.stats.writes += 1;
    this.deps.saved?.(document, this.metrics());
  }

  /**
   * Saves the scene as a snapshot right away (a level was opened or saved),
   * after a write that is already running; the next 30 minutes start now.
   *
   * @returns The snapshot, or null without a writable project.
   */
  async snapshot(): Promise<ProjectHistoryEntry | null> {
    const fileSystem = this.deps.fileSystem();
    if (fileSystem === null || !fileSystem.writable) return null;
    this.timerClear();
    if (this.writing !== null) await this.writing;
    const mark = this.markCurrent();
    const { record, data } = this.recordCreate('snapshot');
    const entry = await this.recordWrite(fileSystem, record, data);
    this.savedMark = mark;
    this.lastSnapshot = record.time;
    this.dirty = false;
    return entry;
  }

  /**
   * Copies the embedded textures into the texture cache, takes the thumbnail
   * and adds the save.
   *
   * @param fileSystem Project file system.
   * @param record Save without its thumbnail.
   * @param data Scene data.
   * @returns The save.
   */
  private async recordWrite(
    fileSystem: ProjectFileSystem,
    record: ProjectHistoryRecord,
    data: SceneJSON,
  ): Promise<ProjectHistoryEntry> {
    await projectEditorFolderPrepare(fileSystem);
    await projectTextureCacheKeep(fileSystem, this.deps.library?.() ?? null, data);
    record.shot = (await this.deps.thumbnail?.()) ?? null;
    return projectHistoryStoreFor(fileSystem).add(record);
  }

  /**
   * Captures the scene into a level save ready to record.
   *
   * @param kind Kind of the save.
   * @returns Record, its document and the scene data.
   */
  private recordCreate(kind: ProjectHistoryEntryKind): {
    record: ProjectHistoryRecord;
    document: ProjectAutosaveDocument;
    data: SceneJSON;
  } {
    const { data } = this.deps.capture();
    const objectCount = projectHistoryObjectCount(data);
    const document: ProjectAutosaveDocument = {
      format: PROJECT_AUTOSAVE_FORMAT,
      version: 1,
      scene: projectAutosaveKey(this.sourcePath),
      sourcePath: this.sourcePath,
      savedAt: this.now(),
      objectCount,
      data,
    };
    const record: ProjectHistoryRecord = {
      kind,
      source: 'level',
      time: document.savedAt,
      path: this.sourcePath,
      title: projectHistoryTitle(this.deps.title?.() ?? this.sourcePath),
      room: null,
      objectCount,
      state: JSON.stringify(document),
      shot: null,
    };
    return { record, document, data };
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
