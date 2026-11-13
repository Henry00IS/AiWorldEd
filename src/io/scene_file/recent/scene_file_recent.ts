import type { SceneFileHandle } from '@/io/scene_file/scene_file_session.js';
import { sceneFileRecentListAdd, type SceneFileRecentEntry } from './scene_file_recent_list.js';
import type { SceneFileRecentStorage } from './scene_file_recent_store.js';

/**
 * How a Recent file can be reached: readable now, or after the browser asks the
 * user once.
 */
export type SceneFileRecentAccess = 'granted' | 'prompt';

/** A Recent file the browser still has access to. */
export interface SceneFileRecentItem {
  entry: SceneFileRecentEntry;
  access: SceneFileRecentAccess;
}

/** Result of checking one Recent file. */
type SceneFileRecentCheck = SceneFileRecentAccess | 'hidden' | 'gone';

/**
 * The files opened or saved most recently. Lists only files the browser still
 * has access to, without asking; files that no longer exist drop off the list.
 */
export class SceneFileRecent {
  private entries: SceneFileRecentEntry[] = [];
  private items: SceneFileRecentItem[] = [];
  private chain: Promise<void> = Promise.resolve();

  /**
   * Creates the list.
   *
   * @param storage Keeps the list across reloads.
   * @param now Clock in milliseconds.
   */
  constructor(
    private readonly storage: SceneFileRecentStorage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Reads the stored list and checks which files are still reachable.
   *
   * @returns Resolves once checked.
   */
  start(): Promise<void> {
    return this.queue(async () => {
      this.entries = await this.storage.load().catch(() => []);
      await this.check();
    });
  }

  /**
   * Returns the reachable files, newest first.
   *
   * @returns Reachable files.
   */
  accessible(): readonly SceneFileRecentItem[] {
    return this.items;
  }

  /**
   * Puts a file that was opened or saved at the top of the list.
   *
   * @param handle File handle.
   * @returns Resolves once stored and checked.
   */
  remember(handle: SceneFileHandle): Promise<void> {
    return this.queue(async () => {
      this.entries = await sceneFileRecentListAdd(this.entries, handle, this.now());
      await this.check();
      await this.store();
    });
  }

  /**
   * Checks again which files are reachable (the browser may have dropped
   * access, or a file may have been deleted).
   *
   * @returns Resolves once checked.
   */
  refresh(): Promise<void> {
    return this.queue(() => this.check());
  }

  /**
   * Asks for read access to a Recent file when the browser needs it. Call from
   * a click: the browser only asks during a user action.
   *
   * @param item Recent file.
   * @returns The handle, or null when access was not granted.
   */
  async access(item: SceneFileRecentItem): Promise<SceneFileHandle | null> {
    const handle = item.entry.handle;
    if (handle.queryPermission === undefined || handle.requestPermission === undefined) return handle;
    const state = await handle.queryPermission({ mode: 'read' }).catch(() => 'denied' as const);
    if (state === 'granted') return handle;
    const asked = await handle.requestPermission({ mode: 'read' }).catch(() => 'denied' as const);
    void this.refresh();
    return asked === 'granted' ? handle : null;
  }

  /**
   * Removes a file from the list, for example after it could not be read.
   *
   * @param handle File handle.
   * @returns Resolves once stored.
   */
  forget(handle: SceneFileHandle): Promise<void> {
    return this.queue(async () => {
      this.entries = this.entries.filter((entry) => entry.handle !== handle);
      await this.check();
      await this.store();
    });
  }

  /**
   * Empties the list.
   *
   * @returns Resolves once stored.
   */
  clear(): Promise<void> {
    return this.queue(async () => {
      this.entries = [];
      this.items = [];
      await this.store();
    });
  }

  /**
   * Runs list work one after another, so overlapping calls cannot lose entries.
   *
   * @param work Work to run.
   * @returns Resolves once the work ran.
   */
  private queue(work: () => Promise<void>): Promise<void> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Writes the list, ignoring storage failures. */
  private async store(): Promise<void> {
    await this.storage.save(this.entries).catch(() => undefined);
  }

  /** Rebuilds the reachable files and drops files that no longer exist. */
  private async check(): Promise<void> {
    const checks = await Promise.all(this.entries.map((entry) => sceneFileRecentCheck(entry.handle)));
    const gone = this.entries.filter((_entry, index) => checks[index] === 'gone');
    this.items = this.entries.flatMap((entry, index) => sceneFileRecentItem(entry, checks[index]));
    if (gone.length === 0) return;
    this.entries = this.entries.filter((entry) => !gone.includes(entry));
    await this.store();
  }
}

/**
 * Builds the reachable item of one checked entry.
 *
 * @param entry Recent entry.
 * @param check Its check result.
 * @returns The item, or nothing when unreachable.
 */
function sceneFileRecentItem(
  entry: SceneFileRecentEntry,
  check: SceneFileRecentCheck | undefined,
): SceneFileRecentItem[] {
  return check === 'granted' || check === 'prompt' ? [{ entry, access: check }] : [];
}

/**
 * Checks one file without asking the user: readable, reachable after a prompt,
 * hidden (access denied or unreadable now) or gone (deleted).
 *
 * @param handle File handle.
 * @returns Check result.
 */
async function sceneFileRecentCheck(handle: SceneFileHandle): Promise<SceneFileRecentCheck> {
  const state = (await handle.queryPermission?.({ mode: 'read' }).catch(() => 'denied' as const)) ?? 'granted';
  if (state === 'prompt') return 'prompt';
  if (state !== 'granted') return 'hidden';
  try {
    await handle.getFile();
    return 'granted';
  } catch (error) {
    return error instanceof DOMException && error.name === 'NotFoundError' ? 'gone' : 'hidden';
  }
}
