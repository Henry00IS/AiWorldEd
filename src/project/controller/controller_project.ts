import { projectDesktopBridge, type ProjectDesktopBridge } from '@/project/desktop/project_desktop_protocol.js';
import { ProjectFileSystemDesktop } from '@/project/desktop/project_file_system_desktop.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { ProjectPickerBrowser, type ProjectPicker } from '@/project/fs/project_picker.js';
import { StoreProjectHandle } from '@/project/fs/store_project_handle.js';
import {
  projectSnapshotEmpty,
  type ProjectSnapshot,
  type ProjectSnapshotDiff,
} from '@/project/scan/project_snapshot.js';
import { ProjectTextureSync, type ProjectTextureSyncGate } from '@/project/textures/project_texture_sync.js';
import { ProjectWatcher } from '@/project/watch/project_watcher.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { textureSourceBlocked, textureSourceGateListen } from '@/texture/library/texture_source_gate.js';

/** What happened to the project. */
export type ControllerProjectEvent =
  | { type: 'opened'; fileSystem: ProjectFileSystem }
  | { type: 'changed'; diff: ProjectSnapshotDiff }
  | { type: 'closed' }
  | { type: 'status'; message: string };

/** Receives project events. */
export type ControllerProjectListener = (event: ControllerProjectEvent) => void;

/** Dependencies of the project controller (overridable in tests). */
export interface ControllerProjectDependencies {
  library: TextureLibrary;
  picker?: ProjectPicker;
  store?: StoreProjectHandle;
  desktop?: ProjectDesktopBridge | null;
  gate?: ProjectTextureSyncGate;
  watcherCreate?: (fileSystem: ProjectFileSystem, listener: (diff: ProjectSnapshotDiff) => void) => ProjectWatcher;
}

/**
 * Owns the open project folder: picking it, remembering it across reloads
 * (asking for permission again on a click), watching it and mirroring its
 * images into the texture library.
 */
export class ControllerProject {
  private readonly library: TextureLibrary;
  private readonly picker: ProjectPicker;
  private readonly store: StoreProjectHandle;
  private readonly desktop: ProjectDesktopBridge | null;
  private readonly gate: ProjectTextureSyncGate;
  private readonly watcherCreate: NonNullable<ControllerProjectDependencies['watcherCreate']>;
  private readonly listeners: Set<ControllerProjectListener>;
  private readonly gateUnlisten: () => void;
  private current: ProjectFileSystem | null;
  private watcher: ProjectWatcher | null;
  private textures: ProjectTextureSync | null;
  private pending: ProjectFileSystem | null;
  private busy: boolean;

  /**
   * Creates the controller; {@link restore} reopens the last project.
   *
   * @param deps Texture library and optional overrides.
   */
  constructor(deps: ControllerProjectDependencies) {
    this.library = deps.library;
    this.picker = deps.picker ?? new ProjectPickerBrowser();
    this.store = deps.store ?? new StoreProjectHandle();
    this.desktop = deps.desktop === undefined ? projectDesktopBridge() : deps.desktop;
    this.gate = deps.gate ?? textureSourceBlocked;
    this.watcherCreate = deps.watcherCreate ?? ((fileSystem, listener) => new ProjectWatcher(fileSystem, listener));
    this.listeners = new Set();
    this.gateUnlisten = textureSourceGateListen(() => this.texturesResync());
    this.current = null;
    this.watcher = null;
    this.textures = null;
    this.pending = null;
    this.busy = false;
  }

  /**
   * Registers a listener.
   *
   * @param listener Receives events.
   * @returns Removes the listener.
   */
  listenerAdd(listener: ControllerProjectListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Returns the open project folder.
   *
   * @returns Folder, or null.
   */
  fileSystem(): ProjectFileSystem | null {
    return this.current;
  }

  /**
   * Returns the latest snapshot of the open project.
   *
   * @returns Snapshot (empty without a project).
   */
  snapshot(): ProjectSnapshot {
    return this.watcher?.snapshot() ?? projectSnapshotEmpty();
  }

  /**
   * Returns the watcher of the open project (for status and tests).
   *
   * @returns Watcher, or null.
   */
  watcherCurrent(): ProjectWatcher | null {
    return this.watcher;
  }

  /**
   * Returns the remembered project that waits for permission.
   *
   * @returns Folder name, or null.
   */
  pendingName(): string | null {
    return this.pending?.name ?? null;
  }

  /**
   * Lets the user pick a project folder and opens it.
   *
   * @returns True when a project was opened.
   */
  async open(): Promise<boolean> {
    if (this.busy) return false;
    const blocked = this.gate();
    if (blocked !== null) return this.status(blocked);
    this.busy = true;
    try {
      const pick = await this.picker.pick();
      if (pick === null) return false;
      if (pick.handle !== null) await this.store.save(pick.handle).catch(() => undefined);
      await this.activate(pick.fileSystem);
      if (pick.notice !== null) this.status(pick.notice);
      return true;
    } catch (error) {
      return this.status(`Could not open the project folder: ${controllerProjectErrorText(error)}`);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Reopens the last project when access is still granted; otherwise keeps it
   * pending until {@link reopen} runs from a click.
   */
  async restore(): Promise<void> {
    const remembered = await this.rememberedLoad();
    if (remembered === null || this.current !== null) return;
    const permission = await remembered.permissionQuery().catch(() => 'denied' as PermissionState);
    if (permission === 'granted') return this.activate(remembered);
    if (permission === 'prompt') this.pending = remembered;
    this.status(this.pending === null ? '' : `Click to reopen project "${remembered.name}"`);
  }

  /**
   * Asks again for access to the remembered project (call from a click).
   *
   * @returns True when the project was opened.
   */
  async reopen(): Promise<boolean> {
    const pending = this.pending;
    if (pending === null) return false;
    if (!(await pending.permissionRequest().catch(() => false)))
      return this.status('Access to the project folder was not granted');
    this.pending = null;
    await this.activate(pending);
    return true;
  }

  /** Closes the project and forgets it for the next visit. */
  async close(): Promise<void> {
    this.deactivate();
    this.pending = null;
    await this.store.clear();
    this.emit({ type: 'closed' });
  }

  /** Stops watching and releases listeners. */
  dispose(): void {
    this.deactivate();
    this.gateUnlisten();
    this.listeners.clear();
  }

  /**
   * Makes a folder the open project.
   *
   * @param fileSystem Project folder.
   */
  private async activate(fileSystem: ProjectFileSystem): Promise<void> {
    this.deactivate();
    this.current = fileSystem;
    const textures = new ProjectTextureSync(fileSystem, this.library, this.gate);
    const watcher = this.watcherCreate(fileSystem, (diff) => this.changed(diff));
    watcher.errorListenerSet((error) =>
      this.status(`Project folder unavailable: ${controllerProjectErrorText(error)}`),
    );
    this.textures = textures;
    this.watcher = watcher;
    this.library.folderNameSet(fileSystem.name);
    this.emit({ type: 'opened', fileSystem });
    await watcher.start();
    await textures.sync(watcher.snapshot());
  }

  /** Stops the open project's watcher and texture mirror. */
  private deactivate(): void {
    this.watcher?.stop();
    this.textures?.stop();
    if (this.current !== null && this.gate() === null) this.library.folderNameSet(null);
    this.watcher = null;
    this.textures = null;
    this.current = null;
  }

  /**
   * Mirrors a disk change into the library and tells listeners.
   *
   * @param diff What changed.
   */
  private changed(diff: ProjectSnapshotDiff): void {
    const watcher = this.watcher;
    if (watcher !== null) void this.textures?.sync(watcher.snapshot());
    this.emit({ type: 'changed', diff });
  }

  /** Catches up with the project once the texture gate lifts. */
  private texturesResync(): void {
    if (this.watcher !== null && this.gate() === null) void this.textures?.sync(this.watcher.snapshot());
  }

  /**
   * Loads the remembered project folder.
   *
   * @returns Folder, or null.
   */
  private async rememberedLoad(): Promise<ProjectFileSystem | null> {
    if (this.desktop !== null) {
      const root = await this.desktop.last().catch(() => null);
      return root === null ? null : new ProjectFileSystemDesktop(this.desktop, root);
    }
    const handle = await this.store.load();
    return handle === null ? null : new ProjectFileSystemHandle(handle);
  }

  /**
   * Tells listeners about a status message.
   *
   * @param message Text.
   * @returns False, so failure paths can return it.
   */
  private status(message: string): false {
    this.emit({ type: 'status', message });
    return false;
  }

  /**
   * Sends an event to every listener.
   *
   * @param event Event.
   */
  private emit(event: ControllerProjectEvent): void {
    [...this.listeners].forEach((listener) => listener(event));
  }
}

/**
 * Turns an error into short text.
 *
 * @param error Error.
 * @returns Message.
 */
export function controllerProjectErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
