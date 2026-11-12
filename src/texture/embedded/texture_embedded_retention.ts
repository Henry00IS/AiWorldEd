import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { textureEmbeddedDetach } from './texture_embedded_library.js';

/** What the retention needs from the editor. */
export interface TextureEmbeddedRetentionDeps {
  /** Texture library, or null. */
  library: () => TextureLibrary | null;
  /**
   * Embedded texture ids the scene and its undo and redo entries use, or null
   * when unknown (then every texture counts as used).
   */
  references: () => Set<string> | null;
}

/**
 * Keeps embedded textures readable while their level file is written over: the
 * ones the new file leaves out but the scene or its undo and redo entries still
 * use are read into memory right before the write, the others leave the library
 * once the write succeeded. A texture held in memory only for the history
 * leaves the library once nothing uses it any more.
 */
export class TextureEmbeddedRetention {
  private readonly fileBacked = new Set<string>();
  private readonly held = new Set<string>();

  /**
   * Creates the retention.
   *
   * @param deps Library and references.
   */
  constructor(private readonly deps: TextureEmbeddedRetentionDeps) {}

  /**
   * Records textures whose bytes now come from a level file.
   *
   * @param ids Texture ids.
   */
  backedByFile(ids: Iterable<string>): void {
    for (const id of ids) {
      this.fileBacked.add(id);
      this.held.delete(id);
    }
  }

  /**
   * Runs right before a level file is written over: reads the file-backed
   * textures the new file leaves out but something still uses into memory.
   * Changes nothing the Texture Browser shows, so a failed write needs no
   * undo.
   *
   * @param saved Ids the new file holds.
   */
  async beforeOverwrite(saved: Iterable<string>): Promise<void> {
    const library = this.deps.library();
    if (library === null) return;
    await textureEmbeddedDetach(library, this.leftOut(saved).used);
  }

  /**
   * Runs once a level file was written: holds the left-out textures still used
   * and lets the unused ones leave the library.
   *
   * @param saved Ids the new file holds.
   */
  overwritten(saved: Iterable<string>): void {
    const { used, unused } = this.leftOut(saved);
    [...used, ...unused].forEach((id) => this.fileBacked.delete(id));
    used.forEach((id) => this.held.add(id));
    const library = this.deps.library();
    if (library !== null && unused.length > 0) library.entriesRemove(new Set(unused));
  }

  /**
   * Splits the file-backed textures a new file leaves out by whether the scene
   * or its history still uses them.
   *
   * @param saved Ids the new file holds.
   * @returns Left-out ids still used, and the unused ones.
   */
  private leftOut(saved: Iterable<string>): { used: string[]; unused: string[] } {
    const kept = new Set(saved);
    const left = [...this.fileBacked].filter((id) => !kept.has(id));
    const references = this.deps.references();
    const used = left.filter((id) => references === null || references.has(id));
    return { used, unused: left.filter((id) => !used.includes(id)) };
  }

  /** Drops held textures nothing uses any more; call when the history changed. */
  release(): void {
    const library = this.deps.library();
    if (this.held.size === 0 || library === null) return;
    const references = this.deps.references();
    if (references === null) return;
    const gone = [...this.held].filter((id) => !references.has(id));
    gone.forEach((id) => this.held.delete(id));
    if (gone.length > 0) library.entriesRemove(new Set(gone));
  }
}
