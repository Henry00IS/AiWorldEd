import type { ControllerProject } from '@/project/controller/controller_project.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectTextureCacheCleanup } from '@/project/textures/cache/project_texture_cache_cleanup.js';
import { ProjectTextureScanPace } from '@/project/textures/cache/project_texture_cache_scan.js';
import type { UserIdleWatch } from '@/utils/user_idle.js';

/**
 * Time a local project is open, or out of a room, before the first cleanup
 * pass.
 */
export const PROJECT_TEXTURE_CACHE_DELAY_MS = 5 * 60 * 1000;

/** Time between the end of one cleanup pass and the start of the next. */
export const PROJECT_TEXTURE_CACHE_INTERVAL_MS = 60 * 60 * 1000;

/** How often the host checks for a room, and retries while a level loads. */
export const PROJECT_TEXTURE_CACHE_POLL_MS = 5000;

/** What the cache host needs from the editor. */
export interface ProjectTextureCacheHostDeps {
  project: ControllerProject;
  /** Texture ids the open scene and its undo history use. */
  live: () => Iterable<string>;
  /** True while a level or the project is still loading; the pass waits for it. */
  loading?: () => boolean;
  /** Gates the pass: it works only while the user is idle. */
  idle?: UserIdleWatch;
  /** True while in a collaboration room (owner or member). */
  inRoom?: () => boolean;
  /** Clock in milliseconds (tests). */
  now?: () => number;
}

/**
 * Deletes cached textures no autosave or snapshot uses any more, at safe
 * moments. The first pass starts five minutes after a writable project opened,
 * the next one an hour after a pass ended, however long it took. A pass works
 * in short slices and only while the user is idle and no level loads; input
 * pauses it where it was. Entering a room, as owner or member, cancels the pass
 * and the countdown; leaving it starts the five-minute countdown again. Closing
 * the project cancels everything. State belongs to the open project folder
 * itself, so another folder of the same name gets its own passes.
 */
export class ProjectTextureCacheHost {
  private fileSystem: ProjectFileSystem | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poller: ReturnType<typeof setTimeout> | null = null;
  private running: AbortController | null = null;
  private room = false;

  /**
   * Creates the host.
   *
   * @param deps Editor services.
   */
  constructor(private readonly deps: ProjectTextureCacheHostDeps) {}

  /**
   * Starts the countdown of a freshly opened project.
   *
   * @param fileSystem Opened project.
   */
  projectOpened(fileSystem: ProjectFileSystem): void {
    this.dispose();
    if (!fileSystem.writable) return;
    this.fileSystem = fileSystem;
    this.room = this.inRoom();
    this.pollSchedule();
    if (!this.room) this.countdown(PROJECT_TEXTURE_CACHE_DELAY_MS);
  }

  /** Cancels the countdown and any pass (project closed or suspended). */
  projectClosed(): void {
    this.dispose();
  }

  /**
   * Tells whether a pass is running.
   *
   * @returns True while a pass works or waits for idle.
   */
  passRunning(): boolean {
    return this.running !== null;
  }

  /** Cancels the countdown, the room check and any pass. */
  dispose(): void {
    this.fileSystem = null;
    this.timerClear();
    if (this.poller !== null) clearTimeout(this.poller);
    this.poller = null;
    this.cancel();
  }

  /**
   * Notices entering or leaving a room: entering cancels the countdown and the
   * pass, leaving starts the countdown again.
   *
   * @returns True while in a room.
   */
  private roomCheck(): boolean {
    const room = this.inRoom();
    if (room === this.room) return room;
    this.room = room;
    this.timerClear();
    this.cancel();
    if (!room && this.fileSystem !== null) this.countdown(PROJECT_TEXTURE_CACHE_DELAY_MS);
    return room;
  }

  /** Checks for a room every few seconds while a project is open. */
  private pollSchedule(): void {
    this.poller = setTimeout(() => {
      this.roomCheck();
      if (this.fileSystem !== null) this.pollSchedule();
    }, PROJECT_TEXTURE_CACHE_POLL_MS);
  }

  /**
   * Starts the countdown to the next pass.
   *
   * @param ms Delay.
   */
  private countdown(ms: number): void {
    this.timerClear();
    this.timer = setTimeout(() => void this.pass(), ms);
  }

  /** Runs one pass unless the project changed, then counts down to the next. */
  private async pass(): Promise<void> {
    this.timer = null;
    const fileSystem = this.fileSystem;
    if (fileSystem === null || this.usable() !== fileSystem || this.roomCheck()) return;
    if (this.deps.loading?.() === true) return this.countdown(PROJECT_TEXTURE_CACHE_POLL_MS);
    const running = new AbortController();
    this.running = running;
    await projectTextureCacheCleanup({
      fileSystem,
      live: this.deps.live,
      pace: new ProjectTextureScanPace({ signal: running.signal, idle: this.gate(running.signal) }),
      allowed: () => !running.signal.aborted && this.usable() === fileSystem && !this.roomCheck(),
      ...(this.deps.now !== undefined ? { now: this.deps.now } : {}),
    }).catch(() => undefined);
    this.passEnded(running);
  }

  /**
   * Counts down to the next pass after one ended, unless it was cancelled.
   *
   * @param running The pass's controller.
   */
  private passEnded(running: AbortController): void {
    if (this.running !== running) return;
    this.running = null;
    if (!running.signal.aborted) this.countdown(PROJECT_TEXTURE_CACHE_INTERVAL_MS);
  }

  /**
   * Returns when the pass may work: the user is idle, no level loads and no
   * room is on (a room cancels the pass at once).
   *
   * @param signal Cancels the pass.
   * @returns Gate.
   */
  private gate(signal: AbortSignal): UserIdleWatch {
    const { idle } = this.deps;
    const loading = () => this.deps.loading?.() === true;
    return {
      idle: () => !this.roomCheck() && !loading() && (idle?.idle() ?? true),
      idleWait: async () => {
        for (;;) {
          if (idle !== undefined) await idle.idleWait(signal);
          if (signal.aborted || (!loading() && !this.roomCheck())) return;
          await projectTextureCacheSleep(PROJECT_TEXTURE_CACHE_POLL_MS, signal);
        }
      },
    };
  }

  /** Stops a running pass. */
  private cancel(): void {
    this.running?.abort();
    this.running = null;
  }

  /** Clears the countdown. */
  private timerClear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Tells whether this editor is in a room.
   *
   * @returns True in a room.
   */
  private inRoom(): boolean {
    return this.deps.inRoom?.() === true;
  }

  /**
   * Returns the open project folder when the pass may touch it.
   *
   * @returns Folder, or null without a project, read-only or suspended.
   */
  private usable(): ProjectFileSystem | null {
    const fileSystem = this.deps.project.fileSystem();
    if (fileSystem === null || !fileSystem.writable || this.deps.project.suspendedReason() !== null) return null;
    return fileSystem;
  }
}

/**
 * Waits, or stops waiting once cancelled.
 *
 * @param ms Wait time.
 * @param signal Cancels the wait.
 * @returns Resolves after the time or the cancel.
 */
function projectTextureCacheSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}
