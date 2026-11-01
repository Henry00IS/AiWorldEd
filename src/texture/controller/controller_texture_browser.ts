import { TextureBrowser } from '@/texture/ui/browser/texture_browser.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { FolderTextureScanner } from '@/texture/library/folder_texture_scanner.js';
import {
  LocalDirectoryAccess,
  BrowserLocalDirectoryAccess,
  PickedDirectoryListing,
} from '@/texture/library/local_directory_access.js';
import { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { getStateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { textureSourceBlocked } from '@/texture/library/texture_source_gate.js';

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

/** Dependencies for the texture browser controller. */
export interface TextureBrowserControllerDependencies {
  browser: TextureBrowser;
  library?: TextureLibrary;
  scanner?: FolderTextureScanner;
  directoryAccess?: LocalDirectoryAccess;
}

/** Coordinates folder open, library updates, and browser UI refresh. */
export class ControllerTextureBrowser {
  private browser: TextureBrowser;
  private library: TextureLibrary;
  private scanner: FolderTextureScanner;
  private directoryAccess: LocalDirectoryAccess;
  private statusCallback: TextureBrowserStatusCallback | null;
  private selectionCallback: TextureBrowserSelectionCallback | null;
  private isLoading: boolean;

  /**
   * Creates a texture browser controller.
   *
   * @param deps Browser panel and optional overrides for tests.
   */
  constructor(deps: TextureBrowserControllerDependencies) {
    this.browser = deps.browser;
    this.library = deps.library ?? new TextureLibrary();
    this.scanner = deps.scanner ?? new FolderTextureScanner();
    this.directoryAccess = deps.directoryAccess ?? new BrowserLocalDirectoryAccess();
    this.statusCallback = null;
    this.selectionCallback = null;
    this.isLoading = false;
    getTextureMapCache().setLibrary(this.library);
    if (!this.library.getSelectedId()) {
      this.library.selectById(DEFAULT_CHECKER_TEXTURE_ID);
    }
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
   * Returns the texture library instance.
   *
   * @returns Library catalog.
   */
  getLibrary(): TextureLibrary {
    return this.library;
  }

  /**
   * Returns whether a folder open is currently in progress.
   *
   * @returns True while loading.
   */
  getIsLoading(): boolean {
    return this.isLoading;
  }

  /** Opens a local folder picker and loads image textures into the library. */
  async openFolder(): Promise<void> {
    if (this.isLoading) return;
    const blocked = textureSourceBlocked();
    if (blocked !== null) {
      this.reportStatus(blocked);
      return;
    }
    if (!this.directoryAccess.isSupported()) {
      this.reportUnsupported();
      return;
    }
    this.isLoading = true;
    this.browser.setStatusMessage('Opening folder…');
    try {
      await this.loadFromDirectoryPicker();
    } finally {
      this.isLoading = false;
    }
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
    this.browser.setEntries(this.library.getEntries(), this.library.getSelectedId(), this.library.getFolderName());
  }

  /** Releases library resources (object URLs). */
  dispose(): void {
    this.library.clear();
    getTextureMapCache().setLibrary(null);
    getTextureMapCache().pruneMissingLibraryEntries();
    this.statusCallback = null;
    this.selectionCallback = null;
  }

  /** Runs the directory picker and applies the scan result. */
  private async loadFromDirectoryPicker(): Promise<void> {
    const listing = await this.directoryAccess.pickDirectoryAndListFiles();
    if (!listing) {
      this.browser.setStatusMessage(
        this.library.getEntryCount() > 0 ? `${this.library.getEntryCount()} texture(s)` : 'Folder open cancelled',
      );
      return;
    }
    const blocked = textureSourceBlocked();
    if (blocked !== null) return this.reportStatus(blocked);
    this.applyListing(listing);
  }

  /**
   * Scans a listing into the library and refreshes the UI.
   *
   * @param listing Picked directory listing.
   */
  private applyListing(listing: PickedDirectoryListing): void {
    const scan = this.scanner.scanListing(listing);
    this.library.replaceAll(listing.folderName, scan.entries);
    getTextureMapCache().setLibrary(this.library);
    getTextureMapCache().pruneMissingLibraryEntries();
    this.refreshBrowserUi();
    this.reportLoadResult(scan.entries.length, scan.skippedNonImageCount);
  }

  /**
   * Reports load summary to the status bar and browser footer.
   *
   * @param textureCount Number of images loaded.
   * @param skippedCount Non-image files skipped.
   */
  private reportLoadResult(textureCount: number, skippedCount: number): void {
    const skipNote = skippedCount > 0 ? ` (${skippedCount} non-image skipped)` : '';
    const message = `Loaded ${textureCount} texture(s)${skipNote}`;
    this.browser.setStatusMessage(`${textureCount} texture(s)${skipNote}`);
    this.statusCallback?.(message);
  }

  /** Reports that folder access is not available in this browser. */
  private reportUnsupported(): void {
    this.reportStatus('Folder access is not supported in this browser');
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
