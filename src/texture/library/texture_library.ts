import { TextureBrowserEntry, revokeTextureBrowserEntry } from './texture_browser_entry.js';
import { getDefaultCheckerBrowserEntry, isBuiltinCheckerEntry } from './default_checker_entry.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from './texture_id.js';

/** Runs after the library's entries, folder or selection changed. */
export type TextureLibraryListener = () => void;

/**
 * In-memory catalog of textures for the texture browser. Always includes the
 * built-in checker as the first entry. Owns object URL lifetimes for folder
 * previews.
 */
export class TextureLibrary {
  private folderEntries: TextureBrowserEntry[];
  private readonly entriesById: Map<string, TextureBrowserEntry>;
  private readonly listeners: Set<TextureLibraryListener>;
  private selectedId: string;
  private folderName: string | null;
  private revision: number;

  /** Creates a library containing only the built-in checker. */
  constructor() {
    this.folderEntries = [];
    this.entriesById = new Map();
    this.listeners = new Set();
    this.selectedId = DEFAULT_CHECKER_TEXTURE_ID;
    this.folderName = null;
    this.revision = 0;
  }

  /**
   * Registers a listener run synchronously after every change.
   *
   * @param listener Listener to add.
   * @returns Function that removes the listener.
   */
  listenerAdd(listener: TextureLibraryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Returns a counter that grows whenever the folder is replaced or cleared, so
   * observers can tell that textures with unchanged ids may hold new content.
   *
   * @returns Library revision.
   */
  getRevision(): number {
    return this.revision;
  }

  /**
   * Replaces folder textures with a new scan result. The built-in checker
   * remains first; previous folder URLs are revoked.
   *
   * @param folderName Display name of the opened folder.
   * @param entries New folder texture entries (checker must not be included).
   */
  replaceAll(folderName: string, entries: TextureBrowserEntry[]): void {
    this.revokeFolderEntries();
    this.revision += 1;
    this.folderName = folderName;
    this.folderEntriesSet(entries.filter((entry) => !isBuiltinCheckerEntry(entry)));
    this.changed();
  }

  /**
   * Sets the display name of the opened folder without touching entries.
   *
   * @param folderName Folder name, or null when none is open.
   */
  folderNameSet(folderName: string | null): void {
    if (this.folderName === folderName) return;
    this.folderName = folderName;
    this.changed();
  }

  /**
   * Adds textures and replaces same-id ones in place (revoking the old preview
   * URLs), for files that appeared or changed on disk. Grows the revision when
   * anything changed.
   *
   * @param entries Entries to add or replace (checker entries are ignored).
   * @returns Number of entries added or replaced.
   */
  entriesUpsert(entries: readonly TextureBrowserEntry[]): number {
    let count = 0;
    for (const entry of entries) {
      if (isBuiltinCheckerEntry(entry)) continue;
      this.entryUpsertOne(entry);
      count += 1;
    }
    if (count > 0) this.revisionChanged();
    return count;
  }

  /**
   * Appends textures received from another source (for example a collaboration
   * room owner) without replacing the opened folder. Entries whose id already
   * exists are revoked and skipped.
   *
   * @param entries Entries to append (checker entries are ignored).
   * @returns Number of entries appended.
   */
  entriesAppend(entries: readonly TextureBrowserEntry[]): number {
    let appended = 0;
    for (const entry of entries) {
      if (isBuiltinCheckerEntry(entry) || this.getEntryById(entry.id)) {
        revokeTextureBrowserEntry(entry);
        continue;
      }
      this.folderEntries.push(entry);
      this.entriesById.set(entry.id, entry);
      appended += 1;
    }
    if (appended > 0) this.changed();
    return appended;
  }

  /**
   * Removes entries by id and revokes their preview URLs; the selection falls
   * back to the checker when its entry is removed. Grows the revision when
   * anything was removed.
   *
   * @param ids Entry ids to remove (the checker is never removed).
   * @returns Number of entries removed.
   */
  entriesRemove(ids: ReadonlySet<string>): number {
    const removed = [...ids].filter((id) => this.entriesById.has(id));
    if (removed.length === 0) return 0;
    removed.forEach((id) => this.entryForget(id));
    this.folderEntries = this.folderEntries.filter((entry) => !ids.has(entry.id));
    this.selectionValidate();
    this.revisionChanged();
    return removed.length;
  }

  /** Clears folder entries and resets selection to the checker. */
  clear(): void {
    this.revokeFolderEntries();
    this.revision += 1;
    this.folderEntriesSet([]);
    this.selectedId = DEFAULT_CHECKER_TEXTURE_ID;
    this.folderName = null;
    this.changed();
  }

  /**
   * Returns browser entries with the checker always first.
   *
   * @returns Texture entries including the built-in checker.
   */
  getEntries(): TextureBrowserEntry[] {
    return [getDefaultCheckerBrowserEntry(), ...this.folderEntries];
  }

  /**
   * Returns the number of textures shown in the browser (includes checker).
   *
   * @returns Entry count.
   */
  getEntryCount(): number {
    return this.folderEntries.length + 1;
  }

  /**
   * Returns the opened folder name, or null when no folder is open.
   *
   * @returns Folder name or null.
   */
  getFolderName(): string | null {
    return this.folderName;
  }

  /**
   * Returns the currently selected entry id.
   *
   * @returns Selected id (defaults to checker).
   */
  getSelectedId(): string {
    return this.selectedId;
  }

  /**
   * Returns the currently selected entry.
   *
   * @returns Selected entry (checker when nothing else selected).
   */
  getSelectedEntry(): TextureBrowserEntry {
    return this.getEntryById(this.selectedId) ?? getDefaultCheckerBrowserEntry();
  }

  /**
   * Selects a texture by id.
   *
   * @param id Entry id to select.
   * @returns True when the id exists and was selected.
   */
  selectById(id: string): boolean {
    if (!this.getEntryById(id)) return false;
    this.selectedId = id;
    this.changed();
    return true;
  }

  /**
   * Finds an entry by id (checker or folder).
   *
   * @param id Entry id.
   * @returns Entry or null.
   */
  getEntryById(id: string): TextureBrowserEntry | null {
    if (id === DEFAULT_CHECKER_TEXTURE_ID) {
      return getDefaultCheckerBrowserEntry();
    }
    return this.entriesById.get(id) ?? null;
  }

  /**
   * Replaces the entry list and rebuilds the id index; the selection falls back
   * to the checker when its entry is gone.
   *
   * @param entries New folder entries.
   */
  private folderEntriesSet(entries: readonly TextureBrowserEntry[]): void {
    this.folderEntries = [];
    this.entriesById.clear();
    entries.forEach((entry) => this.entryUpsertOne(entry));
    this.selectionValidate();
  }

  /**
   * Adds one entry or replaces the same-id entry at its position.
   *
   * @param entry Entry to store.
   */
  private entryUpsertOne(entry: TextureBrowserEntry): void {
    const previous = this.entriesById.get(entry.id);
    this.entriesById.set(entry.id, entry);
    if (previous === undefined) {
      this.folderEntries.push(entry);
      return;
    }
    if (previous !== entry) revokeTextureBrowserEntry(previous);
    const index = this.folderEntries.indexOf(previous);
    if (index >= 0) this.folderEntries[index] = entry;
  }

  /**
   * Revokes one entry's preview URL and drops it from the index.
   *
   * @param id Entry id.
   */
  private entryForget(id: string): void {
    const entry = this.entriesById.get(id);
    if (entry !== undefined) revokeTextureBrowserEntry(entry);
    this.entriesById.delete(id);
  }

  /** Falls back to the checker when the selected entry is gone. */
  private selectionValidate(): void {
    if (!this.getEntryById(this.selectedId)) this.selectedId = DEFAULT_CHECKER_TEXTURE_ID;
  }

  /** Grows the revision after content changed and notifies listeners. */
  private revisionChanged(): void {
    this.revision += 1;
    this.changed();
  }

  /** Notifies every listener. */
  private changed(): void {
    [...this.listeners].forEach((listener) => listener());
  }

  /** Revokes object URLs for folder entries only. */
  private revokeFolderEntries(): void {
    this.folderEntries.forEach((entry) => {
      if (!isBuiltinCheckerEntry(entry)) {
        revokeTextureBrowserEntry(entry);
      }
    });
  }
}
