import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectFileTextureMime } from '@/project/fs/project_file_kind.js';
import type { ProjectFileRecord, ProjectSnapshot } from '@/project/scan/project_snapshot.js';
import { createTextureBrowserEntry, type TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { textureSourceBlocked } from '@/texture/library/texture_source_gate.js';

/** How many texture files are read at once. */
const PROJECT_TEXTURE_SYNC_READS_PARALLEL = 16;

/**
 * Tells why the local texture source is refused (collaboration member), or
 * null.
 */
export type ProjectTextureSyncGate = () => string | null;

/**
 * Mirrors the project's image files into a texture library: new and changed
 * files are (re)read, missing ones removed, unchanged ones left alone. Ids are
 * project-relative paths so scenes keep pointing at the same textures. While
 * the gate refuses (a collaboration member uses the owner's textures) nothing
 * is touched; the next sync after it lifts catches up.
 */
export class ProjectTextureSync {
  private readonly fileSystem: ProjectFileSystem;
  private readonly library: TextureLibrary;
  private readonly gate: ProjectTextureSyncGate;
  private readonly loaded: Map<string, string>;
  private queue: Promise<void>;
  private stopped: boolean;

  /**
   * Creates a sync.
   *
   * @param fileSystem Project folder.
   * @param library Library to fill.
   * @param gate Tells whether the local source is refused.
   */
  constructor(
    fileSystem: ProjectFileSystem,
    library: TextureLibrary,
    gate: ProjectTextureSyncGate = textureSourceBlocked,
  ) {
    this.fileSystem = fileSystem;
    this.library = library;
    this.gate = gate;
    this.loaded = new Map();
    this.queue = Promise.resolve();
    this.stopped = false;
  }

  /**
   * Tells whether the library currently mirrors the project.
   *
   * @returns True when the gate allows the local source.
   */
  isActive(): boolean {
    return this.gate() === null;
  }

  /**
   * Brings the library in line with a snapshot; calls run one after another.
   *
   * @param snapshot Current project snapshot.
   * @returns Resolves after the library was updated.
   */
  sync(snapshot: ProjectSnapshot): Promise<void> {
    this.queue = this.queue.then(() => this.syncRun(snapshot)).catch(() => undefined);
    return this.queue;
  }

  /** Stops syncing and removes the project's textures from the library. */
  stop(): void {
    this.stopped = true;
    if (this.gate() === null) this.library.entriesRemove(new Set(this.loaded.keys()));
    this.loaded.clear();
  }

  /**
   * Runs one sync.
   *
   * @param snapshot Current project snapshot.
   */
  private async syncRun(snapshot: ProjectSnapshot): Promise<void> {
    if (this.stopped) return;
    if (this.gate() !== null) return this.loaded.clear();
    const textures = [...snapshot.files.values()].filter((record) => record.kind === 'texture');
    const stale = textures.filter((record) => this.loaded.get(record.path) !== projectTextureSyncStamp(record));
    const entries = await this.entriesRead(stale);
    if (this.stopped || this.gate() !== null)
      return entries.forEach((entry) => URL.revokeObjectURL(entry.previewObjectUrl));
    this.libraryApply(snapshot, entries, stale);
  }

  /**
   * Updates the library with read entries and drops vanished textures.
   *
   * @param snapshot Current project snapshot.
   * @param entries Entries read from disk.
   * @param stale Records that were read.
   */
  private libraryApply(
    snapshot: ProjectSnapshot,
    entries: readonly TextureBrowserEntry[],
    stale: readonly ProjectFileRecord[],
  ): void {
    const read = new Set(entries.map((entry) => entry.id));
    stale.forEach((record) => {
      if (read.has(record.path)) this.loaded.set(record.path, projectTextureSyncStamp(record));
    });
    const gone = new Set([...this.loaded.keys()].filter((path) => snapshot.files.get(path)?.kind !== 'texture'));
    gone.forEach((path) => this.loaded.delete(path));
    this.library.folderNameSet(this.fileSystem.name);
    if (entries.length > 0) this.library.entriesUpsert(entries);
    if (gone.size > 0) this.library.entriesRemove(gone);
  }

  /**
   * Reads texture files a few at a time; unreadable files are skipped.
   *
   * @param records Files to read.
   * @returns Entries for the files that could be read.
   */
  private async entriesRead(records: readonly ProjectFileRecord[]): Promise<TextureBrowserEntry[]> {
    const entries: TextureBrowserEntry[] = [];
    for (let start = 0; start < records.length; start += PROJECT_TEXTURE_SYNC_READS_PARALLEL) {
      const batch = records.slice(start, start + PROJECT_TEXTURE_SYNC_READS_PARALLEL);
      const read = await Promise.all(batch.map((record) => this.entryRead(record)));
      read.forEach((entry) => entry !== null && entries.push(entry));
      if (this.stopped) break;
    }
    return entries;
  }

  /**
   * Reads one texture file.
   *
   * @param record File to read.
   * @returns Entry, or null when the file could not be read.
   */
  private async entryRead(record: ProjectFileRecord): Promise<TextureBrowserEntry | null> {
    try {
      const file = await this.fileSystem.fileRead(record.path);
      const typed = file.type
        ? file
        : new File([file], record.name, { type: projectFileTextureMime(record.name), lastModified: file.lastModified });
      return createTextureBrowserEntry(typed, record.path);
    } catch {
      return null;
    }
  }
}

/**
 * Identifies one version of a file.
 *
 * @param record File record.
 * @returns Size and time stamp.
 */
function projectTextureSyncStamp(record: ProjectFileRecord): string {
  return `${record.size}:${record.lastModified}`;
}
