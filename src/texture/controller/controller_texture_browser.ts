import { TextureBrowser, type TextureBrowserSource } from '@/texture/ui/browser/texture_browser.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { getStateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { textureSourceBlocked, textureSourceGateListen } from '@/texture/library/texture_source_gate.js';

/**
 * Callback for status messages shown in the editor status bar.
 *
 * @param message Status text.
 */
export type TextureBrowserStatusCallback = (message: string) => void;

/**
 * Callback when the user selects a texture in the browser.
 *
 * @param entry Selected entry, or null when cleared.
 */
export type TextureBrowserSelectionCallback = (entry: TextureBrowserEntry | null) => void;

/** Opens a project folder (the project panel owns the folder). */
export type TextureBrowserProjectOpener = () => Promise<void> | void;

/** Tells whether a project folder is open. */
export type TextureBrowserProjectOpen = () => boolean;

/** Dependencies for the texture browser controller. */
export interface TextureBrowserControllerDependencies {
  browser: TextureBrowser;
  library?: TextureLibrary;
}

/**
 * Keeps the texture browser in line with the texture library. Textures come
 * from the open project folder (or the collaboration room owner); the browser
 * itself only offers to open a project while none is open.
 */
export class ControllerTextureBrowser {
  private browser: TextureBrowser;
  private library: TextureLibrary;
  private statusCallback: TextureBrowserStatusCallback | null;
  private selectionCallback: TextureBrowserSelectionCallback | null;
  private projectOpener: TextureBrowserProjectOpener | null;
  private projectOpen: TextureBrowserProjectOpen;
  private refreshQueued: boolean;
  private shownRevision: number;
  private shownFolder: string | null;
  private readonly unlisten: Array<() => void>;

  /**
   * Creates a texture browser controller.
   *
   * @param deps Browser panel and optional overrides for tests.
   */
  constructor(deps: TextureBrowserControllerDependencies) {
    this.browser = deps.browser;
    this.library = deps.library ?? new TextureLibrary();
    this.statusCallback = null;
    this.selectionCallback = null;
    this.projectOpener = null;
    this.projectOpen = () => false;
    this.refreshQueued = false;
    this.shownRevision = -1;
    this.shownFolder = null;
    this.unlisten = [
      this.library.listenerAdd(() => this.refreshQueue()),
      textureSourceGateListen(() => this.refreshQueue()),
    ];
    getTextureMapCache().setLibrary(this.library);
    if (!this.library.getSelectedId()) this.library.selectById(DEFAULT_CHECKER_TEXTURE_ID);
    getStateTexturePaint().setLastTextureId(this.library.getSelectedId());
    this.refreshBrowserUi();
  }

  /**
   * Registers a status message callback.
   *
   * @param callback Status handler, or null.
   */
  setStatusCallback(callback: TextureBrowserStatusCallback | null): void {
    this.statusCallback = callback;
  }

  /**
   * Registers a selection change callback.
   *
   * @param callback Selection handler, or null.
   */
  setSelectionCallback(callback: TextureBrowserSelectionCallback | null): void {
    this.selectionCallback = callback;
  }

  /**
   * Connects the project panel: how to open a project and whether one is open.
   *
   * @param opener Opens a project folder, or null.
   * @param open Tells whether a project is open.
   */
  setProject(opener: TextureBrowserProjectOpener | null, open: TextureBrowserProjectOpen): void {
    this.projectOpener = opener;
    this.projectOpen = open;
    this.refreshQueue();
  }

  /**
   * Returns the texture library instance.
   *
   * @returns Library catalog.
   */
  getLibrary(): TextureLibrary {
    return this.library;
  }

  /** Opens a project folder unless the room owner provides the textures. */
  async openProject(): Promise<void> {
    const blocked = textureSourceBlocked();
    if (blocked !== null) return this.reportStatus(blocked);
    if (this.projectOpener === null) return this.reportStatus('Project folders are not available here');
    await this.projectOpener();
  }

  /**
   * Selects a texture by id and notifies listeners.
   *
   * @param entryId Entry id from the grid.
   */
  selectTexture(entryId: string): void {
    if (!this.library.selectById(entryId)) return;
    this.browser.setSelectedId(entryId);
    const entry = this.library.getSelectedEntry();
    getStateTexturePaint().setLastTextureId(entry.id);
    this.selectionCallback?.(entry);
  }

  /** Refreshes the browser UI from the current library state. */
  refreshBrowserUi(): void {
    this.refreshQueued = false;
    this.browser.setSource(this.sourceOf());
    const revision = this.library.getRevision();
    const folder = this.library.getFolderName();
    if (revision === this.shownRevision && folder === this.shownFolder) {
      this.browser.setSelectedId(this.library.getSelectedId());
      return;
    }
    this.shownRevision = revision;
    this.shownFolder = folder;
    this.browser.setEntries(this.library.getEntries(), this.library.getSelectedId(), folder);
  }

  /** Stops following the library and releases its resources (object URLs). */
  dispose(): void {
    this.unlisten.forEach((unlisten) => unlisten());
    this.library.clear();
    getTextureMapCache().setLibrary(null);
    getTextureMapCache().pruneMissingLibraryEntries();
    this.statusCallback = null;
    this.selectionCallback = null;
  }

  /** Refreshes once after a burst of library changes. */
  private refreshQueue(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      if (this.refreshQueued) this.refreshBrowserUi();
    });
  }

  /**
   * Tells where the textures come from right now.
   *
   * @returns Texture source.
   */
  private sourceOf(): TextureBrowserSource {
    if (textureSourceBlocked() !== null) return 'remote';
    return this.projectOpen() ? 'project' : 'none';
  }

  /**
   * Shows a message in the browser footer and the status bar.
   *
   * @param message Text to show.
   */
  private reportStatus(message: string): void {
    this.browser.setStatusMessage(message);
    this.statusCallback?.(message);
  }
}
