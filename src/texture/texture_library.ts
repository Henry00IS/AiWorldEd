import {
  TextureBrowserEntry,
  revokeTextureBrowserEntry
} from './texture_browser_entry.js';
import {
  getDefaultCheckerBrowserEntry,
  isBuiltinCheckerEntry
} from './default_checker_entry.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from './texture_id.js';

/**
 * In-memory catalog of textures for the texture browser.
 * Always includes the built-in checker as the first entry.
 * Owns object URL lifetimes for folder previews.
 */
export class TextureLibrary {
  private folderEntries: TextureBrowserEntry[];
  private selectedId: string;
  private folderName: string | null;

  /**
   * Creates a library containing only the built-in checker.
   */
  constructor() {
    this.folderEntries = [];
    this.selectedId = DEFAULT_CHECKER_TEXTURE_ID;
    this.folderName = null;
  }

  /**
   * Replaces folder textures with a new scan result.
   * The built-in checker remains first; previous folder URLs are revoked.
   * @param folderName Display name of the opened folder.
   * @param entries New folder texture entries (checker must not be included).
   */
  replaceAll(folderName: string, entries: TextureBrowserEntry[]): void {
    this.revokeFolderEntries();
    this.folderName = folderName;
    this.folderEntries = entries
      .filter((entry) => !isBuiltinCheckerEntry(entry))
      .slice();
    if (!this.getEntryById(this.selectedId)) {
      this.selectedId = DEFAULT_CHECKER_TEXTURE_ID;
    }
  }

  /**
   * Clears folder entries and resets selection to the checker.
   */
  clear(): void {
    this.revokeFolderEntries();
    this.folderEntries = [];
    this.selectedId = DEFAULT_CHECKER_TEXTURE_ID;
    this.folderName = null;
  }

  /**
   * Returns browser entries with the checker always first.
   * @returns Texture entries including the built-in checker.
   */
  getEntries(): TextureBrowserEntry[] {
    return [getDefaultCheckerBrowserEntry(), ...this.folderEntries];
  }

  /**
   * Returns the number of textures shown in the browser (includes checker).
   * @returns Entry count.
   */
  getEntryCount(): number {
    return this.folderEntries.length + 1;
  }

  /**
   * Returns the opened folder name, or null when no folder is open.
   * @returns Folder name or null.
   */
  getFolderName(): string | null {
    return this.folderName;
  }

  /**
   * Returns the currently selected entry id.
   * @returns Selected id (defaults to checker).
   */
  getSelectedId(): string {
    return this.selectedId;
  }

  /**
   * Returns the currently selected entry.
   * @returns Selected entry (checker when nothing else selected).
   */
  getSelectedEntry(): TextureBrowserEntry {
    return (
      this.getEntryById(this.selectedId) ?? getDefaultCheckerBrowserEntry()
    );
  }

  /**
   * Selects a texture by id.
   * @param id Entry id to select.
   * @returns True when the id exists and was selected.
   */
  selectById(id: string): boolean {
    if (!this.getEntryById(id)) return false;
    this.selectedId = id;
    return true;
  }

  /**
   * Finds an entry by id (checker or folder).
   * @param id Entry id.
   * @returns Entry or null.
   */
  getEntryById(id: string): TextureBrowserEntry | null {
    if (id === DEFAULT_CHECKER_TEXTURE_ID) {
      return getDefaultCheckerBrowserEntry();
    }
    return this.folderEntries.find((entry) => entry.id === id) ?? null;
  }

  /**
   * Revokes object URLs for folder entries only.
   */
  private revokeFolderEntries(): void {
    this.folderEntries.forEach((entry) => {
      if (!isBuiltinCheckerEntry(entry)) {
        revokeTextureBrowserEntry(entry);
      }
    });
  }
}
