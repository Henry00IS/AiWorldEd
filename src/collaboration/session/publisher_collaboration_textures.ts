import type { TextureLibrary } from '@/texture/library/texture_library.js';
import {
  TEXTURES_COLLABORATION_REVISION_INTERVAL_MS,
  TexturesCollaborationHashes,
  texturesCollaborationStamp,
  texturesCollaborationStampSame,
  type TexturesCollaborationStamp,
} from '@/collaboration/session/revision_collaboration_textures.js';

/** Sends one member the ids whose content changed, with their new tags. */
export type TexturesCollaborationDeliver = (
  to: number,
  changed: ReadonlyMap<string, string | null>,
  generation: number,
) => void;

/**
 * Owner side of texture revisions: remembers which content each member got,
 * notices when the owner opens or reloads a folder, and tells each member only
 * the ids whose content changed or vanished, at most once per interval.
 */
export class TexturesCollaborationPublisher {
  readonly hashes: TexturesCollaborationHashes;
  private readonly libraryGet: () => TextureLibrary | null;
  private readonly limit: () => number;
  private readonly deliver: TexturesCollaborationDeliver;
  private readonly served: Map<number, Map<string, string | null>>;
  private observed: TexturesCollaborationStamp;
  private generation: number;
  private publishedAt: number;
  private timer: ReturnType<typeof setTimeout> | null;

  /**
   * Creates the publisher.
   *
   * @param libraryGet Returns the owner's texture library.
   * @param limit Returns the largest asset the relay accepts.
   * @param deliver Sends a revision notice to one member.
   */
  constructor(libraryGet: () => TextureLibrary | null, limit: () => number, deliver: TexturesCollaborationDeliver) {
    this.hashes = new TexturesCollaborationHashes();
    this.libraryGet = libraryGet;
    this.limit = limit;
    this.deliver = deliver;
    this.served = new Map();
    this.observed = texturesCollaborationStamp(libraryGet());
    this.generation = 0;
    this.publishedAt = -Infinity;
    this.timer = null;
  }

  /**
   * Returns the current library stamp.
   *
   * @returns Stamp.
   */
  stamp(): TexturesCollaborationStamp {
    return texturesCollaborationStamp(this.libraryGet());
  }

  /**
   * Records the content a member was sent for an id.
   *
   * @param to Member.
   * @param id Texture id.
   * @param tag Content tag, or null when reported missing.
   */
  servedRecord(to: number, id: string, tag: string | null): void {
    const map = this.served.get(to) ?? new Map<string, string | null>();
    map.set(id, tag);
    this.served.set(to, map);
  }

  /**
   * Forgets a member that left.
   *
   * @param to Member.
   */
  forgetMember(to: number): void {
    this.served.delete(to);
  }

  /** Forgets every member and cancels a pending notice. */
  clear(): void {
    this.served.clear();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.generation += 1;
  }

  /** Notices a folder switch and schedules the revision notices. */
  poll(): void {
    const stamp = this.stamp();
    if (texturesCollaborationStampSame(stamp, this.observed)) return;
    this.observed = stamp;
    this.schedule();
  }

  /** Runs the next publication once the interval since the last one passed. */
  private schedule(): void {
    if (this.timer !== null) return;
    const delay = Math.max(0, this.publishedAt + TEXTURES_COLLABORATION_REVISION_INTERVAL_MS - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.publish();
    }, delay);
  }

  /** Hashes every id a member received and notifies members of changes. */
  private async publish(): Promise<void> {
    const stamp = this.stamp();
    const generation = ++this.generation;
    const tags = await this.tagsFor(stamp.library, this.servedIds());
    if (generation !== this.generation || !texturesCollaborationStampSame(stamp, this.stamp())) return;
    this.publishedAt = Date.now();
    this.served.forEach((map, to) => this.publishTo(to, map, tags, generation));
  }

  /**
   * Notifies one member of the ids whose content differs from what it got.
   *
   * @param to Member.
   * @param map Content the member received.
   * @param tags Current content tags.
   * @param generation Revision generation.
   */
  private publishTo(
    to: number,
    map: Map<string, string | null>,
    tags: ReadonlyMap<string, string | null>,
    generation: number,
  ): void {
    const changed = new Map<string, string | null>();
    map.forEach((tag, id) => {
      const current = tags.get(id);
      if (current !== undefined && current !== tag) changed.set(id, current);
    });
    if (changed.size === 0) return;
    changed.forEach((tag, id) => map.set(id, tag));
    this.deliver(to, changed, generation);
  }

  /**
   * Returns every id sent to any member.
   *
   * @returns Ids.
   */
  private servedIds(): Set<string> {
    const ids = new Set<string>();
    this.served.forEach((map) => map.forEach((_tag, id) => ids.add(id)));
    return ids;
  }

  /**
   * Hashes the current content of ids, one file at a time.
   *
   * @param library Owner library.
   * @param ids Texture ids.
   * @returns Tag per id (null when missing or unsendable).
   */
  private async tagsFor(library: TextureLibrary | null, ids: ReadonlySet<string>): Promise<Map<string, string | null>> {
    const tags = new Map<string, string | null>();
    for (const id of ids) tags.set(id, await this.hashes.of(library?.getEntryById(id) ?? null, this.limit()));
    return tags;
  }
}
