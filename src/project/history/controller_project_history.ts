import { projectAutosaveParse, type ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectHistoryEntryName, type ProjectHistoryEntry } from './core/project_history_entry.js';
import { projectHistoryStoreFor, type ProjectHistoryStore } from './core/project_history_store.js';
import type { ProjectHistoryRoom } from './project_history_room.js';
import { DialogProjectHistory } from './ui/dialog_project_history.js';
import { dialogProjectHistoryClock } from './ui/dialog_project_history_text.js';
import type { DialogProjectHistoryResult, DialogProjectHistorySource } from './ui/dialog_project_history_types.js';

/** What the Level History needs from the level autosave. */
export interface ControllerProjectHistoryAutosave {
  /** Writes pending changes now. */
  flush(): Promise<void>;
}

/** What the Level History needs from the editor. */
export interface ControllerProjectHistoryHost {
  container: HTMLElement;
  /** Open project folder. */
  fileSystem(): ProjectFileSystem | null;
  autosave: ControllerProjectHistoryAutosave;
  /**
   * Loads a saved level state into the editor.
   *
   * @param document Saved state.
   */
  restore(document: ProjectAutosaveDocument): Promise<boolean>;
  /** The room this client owns, or null. */
  room(): ProjectHistoryRoom | null;
  /** Whether this client is in any room. */
  inRoom(): boolean;
}

/**
 * The Level History: every save of the project's levels and rooms, by day.
 * Works with or without a room; only room members, whose project is the
 * owner's, cannot use it.
 */
export class ControllerProjectHistory {
  private readonly host: ControllerProjectHistoryHost;
  /** Store each listed save came from. */
  private stores = new WeakMap<ProjectHistoryEntry, ProjectHistoryStore>();
  private readonly thumbnails = new Map<string, Promise<string | null>>();
  private dialog: DialogProjectHistory | null = null;

  /**
   * Creates the controller.
   *
   * @param host Editor services.
   */
  constructor(host: ControllerProjectHistoryHost) {
    this.host = host;
  }

  /**
   * Returns whether the Level History can open: with a writable project, or
   * while owning a room.
   *
   * @returns True when available.
   */
  available(): boolean {
    if (this.host.room() !== null) return true;
    return this.host.fileSystem()?.writable === true && !this.host.inRoom();
  }

  /** Opens the Level History. */
  async open(): Promise<void> {
    if (!this.available() || this.dialog !== null) return;
    this.dialog = new DialogProjectHistory(this.host.container, this.source());
    await this.dialog.open();
    this.dialog = null;
  }

  /**
   * Reads every save of the project, and of the owned room when it is kept
   * apart in memory.
   *
   * @returns Saves.
   */
  async entries(): Promise<ProjectHistoryEntry[]> {
    const stores: ProjectHistoryStore[] = [];
    const room = this.host.room();
    const fileSystem = this.host.fileSystem();
    if (room !== null) stores.push(await room.store());
    if (fileSystem !== null && !(this.host.inRoom() && room === null)) {
      const store = projectHistoryStoreFor(fileSystem);
      if (!stores.includes(store)) stores.push(store);
    }
    this.stores = new WeakMap();
    const entries: ProjectHistoryEntry[] = [];
    for (const store of stores)
      for (const entry of await store.entries()) {
        this.stores.set(entry, store);
        entries.push(entry);
      }
    return entries;
  }

  /**
   * Builds what the dialog reads and does.
   *
   * @returns Dialog source.
   */
  private source(): DialogProjectHistorySource {
    return {
      entries: () => this.entries(),
      thumbnail: (entry) => this.thumbnail(entry),
      release: () => this.release(),
      restore: (entry) => this.guard(() => this.restore(entry)),
      star: (entry, starred) => this.guard(() => this.star(entry, starred)),
      remove: (entry) => this.guard(() => this.remove(entry)),
    };
  }

  /**
   * Runs an action and turns a failure into a status line.
   *
   * @param run Action.
   * @returns Outcome.
   */
  private async guard(run: () => Promise<DialogProjectHistoryResult>): Promise<DialogProjectHistoryResult> {
    try {
      return await run();
    } catch (error) {
      return { message: `Level History: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Returns the store of a listed save.
   *
   * @param entry Save.
   * @returns Store.
   * @throws {Error} When the save is no longer listed.
   */
  private store(entry: ProjectHistoryEntry): ProjectHistoryStore {
    const store = this.stores.get(entry);
    if (store === undefined) throw new Error('This save is no longer available.');
    return store;
  }

  /**
   * Loads a save's thumbnail once per dialog.
   *
   * @param entry Save.
   * @returns Object URL, or null.
   */
  thumbnail(entry: ProjectHistoryEntry): Promise<string | null> {
    const key = `${entry.source}/${entry.room ?? ''}/${entry.id}`;
    let url = this.thumbnails.get(key);
    if (url === undefined) {
      const store = this.stores.get(entry);
      const read = !entry.thumbnail || store === undefined ? Promise.resolve(null) : store.thumbnailRead(entry);
      url = read.catch(() => null).then((blob) => (blob === null ? null : URL.createObjectURL(blob)));
      this.thumbnails.set(key, url);
    }
    return url;
  }

  /** Frees the thumbnail URLs of the closed dialog. */
  private release(): void {
    for (const url of this.thumbnails.values()) void url.then((value) => value !== null && URL.revokeObjectURL(value));
    this.thumbnails.clear();
  }

  /**
   * Loads a save: a level save into the editor, after saving the changes it
   * holds; a room save rolls the owned room back for everyone.
   *
   * @param entry Save.
   * @returns Outcome.
   */
  async restore(entry: ProjectHistoryEntry): Promise<DialogProjectHistoryResult> {
    const done = {
      message: `Restored ${projectHistoryEntryName(entry)} from ${dialogProjectHistoryClock(entry.time)}.`,
    };
    if (entry.source === 'room') {
      const room = this.host.room();
      if (room === null || room.name !== entry.room)
        return {
          message: `This save belongs to the room \u201c${entry.room ?? ''}\u201d. Host that room to restore it.`,
        };
      await room.restore(entry.id);
      return done;
    }
    if (this.host.inRoom()) return { message: 'Leave the room to restore a level save.' };
    await this.host.autosave.flush();
    const blob = await this.store(entry).stateRead(entry);
    const document = blob === null ? null : projectAutosaveParse(await blob.text());
    if (document === null) return { message: 'This save could not be read.' };
    if (!(await this.host.restore(document))) return { message: 'The save was not restored.' };
    return done;
  }

  /**
   * Stars or unstars a save.
   *
   * @param entry Save.
   * @param starred Whether to star it.
   * @returns Outcome.
   */
  async star(entry: ProjectHistoryEntry, starred: boolean): Promise<DialogProjectHistoryResult> {
    const changed = await this.store(entry).star(entry.id, starred);
    if (changed === null) return { message: 'This save is gone.' };
    if (starred) return { message: 'Starred. This save is never deleted.' };
    return { message: 'Unstarred. This save is deleted after 14 days.' };
  }

  /**
   * Deletes a save.
   *
   * @param entry Save.
   * @returns Outcome.
   */
  async remove(entry: ProjectHistoryEntry): Promise<DialogProjectHistoryResult> {
    await this.store(entry).remove(entry.id);
    return { message: `Deleted the save from ${dialogProjectHistoryClock(entry.time)}.` };
  }
}
