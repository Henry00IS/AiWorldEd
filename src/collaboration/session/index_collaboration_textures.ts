import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import {
  TEXTURES_COLLABORATION_REVISION_IDS_MAXIMUM,
  TEXTURES_COLLABORATION_REVISION_INTERVAL_MS,
  texturesCollaborationRevisionEncode,
} from '@/collaboration/session/revision_collaboration_textures.js';

/**
 * Asset name of a texture index notice: every texture the owner offers. Like
 * the revision notice it has no image extension, so it never collides with a
 * texture id.
 */
export const TEXTURES_COLLABORATION_INDEX_NAME = 'aiworlded:texture-index';
/** Textures a member downloads at once ahead of use. */
export const TEXTURES_COLLABORATION_PREFETCH_PARALLEL = 4;

/** Sends one member an index notice. */
export type TexturesCollaborationIndexDeliver = (to: number, bytes: Uint8Array) => void;

/**
 * Owner side of the texture index: tells each member which textures the owner
 * offers, when the member joins and after the owner's library changes (a
 * project folder file added, changed, removed or renamed), at most once per
 * interval however many files change at once.
 */
export class TexturesCollaborationIndexPublisher {
  private readonly libraryGet: () => TextureLibrary | null;
  private readonly limit: () => number;
  private readonly deliver: TexturesCollaborationIndexDeliver;
  private readonly members: Set<number>;
  private observed: string;
  private generation: number;
  private publishedAt: number;
  private timer: ReturnType<typeof setTimeout> | null;

  /**
   * Creates the publisher.
   *
   * @param libraryGet Returns the owner's texture library.
   * @param limit Returns the largest asset the relay accepts.
   * @param deliver Sends a notice to one member.
   */
  constructor(
    libraryGet: () => TextureLibrary | null,
    limit: () => number,
    deliver: TexturesCollaborationIndexDeliver,
  ) {
    this.libraryGet = libraryGet;
    this.limit = limit;
    this.deliver = deliver;
    this.members = new Set();
    this.observed = this.stamp();
    this.generation = 0;
    this.publishedAt = -Infinity;
    this.timer = null;
  }

  /**
   * Sends a joining member the current index.
   *
   * @param to Member.
   */
  memberAdd(to: number): void {
    this.members.add(to);
    this.deliver(to, this.encode(++this.generation));
  }

  /**
   * Forgets a member that left.
   *
   * @param to Member.
   */
  forgetMember(to: number): void {
    this.members.delete(to);
  }

  /** Notices a library change and schedules the next index notice. */
  poll(): void {
    const stamp = this.stamp();
    if (stamp === this.observed) return;
    this.observed = stamp;
    if (this.timer !== null || this.members.size === 0) return;
    const delay = Math.max(0, this.publishedAt + TEXTURES_COLLABORATION_REVISION_INTERVAL_MS - Date.now());
    this.timer = setTimeout(() => this.publish(), delay);
  }

  /** Forgets every member and cancels a pending notice. */
  clear(): void {
    this.members.clear();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Sends every member the current index. */
  private publish(): void {
    this.timer = null;
    this.publishedAt = Date.now();
    this.observed = this.stamp();
    const bytes = this.encode(++this.generation);
    this.members.forEach((to) => this.deliver(to, bytes));
  }

  /**
   * Returns a key that changes whenever textures were added, replaced or
   * removed.
   *
   * @returns Library revision and entry count.
   */
  private stamp(): string {
    const library = this.libraryGet();
    return library === null ? '' : `${library.getRevision()}:${library.getEntryCount()}`;
  }

  /**
   * Encodes the ids of every sendable texture, capped at the notice limit.
   *
   * @param generation Notice generation.
   * @returns Notice bytes.
   */
  private encode(generation: number): Uint8Array {
    const limit = this.limit();
    const ids = (this.libraryGet()?.getEntries() ?? [])
      .filter((entry) => !isDefaultCheckerTextureId(entry.id) && entry.sourceFile.size <= limit)
      .map((entry) => entry.id)
      .sort()
      .slice(0, TEXTURES_COLLABORATION_REVISION_IDS_MAXIMUM);
    return texturesCollaborationRevisionEncode(generation, ids);
  }
}

/**
 * Member side of the texture index: keeps the library in line with what the
 * owner offers, dropping textures the owner no longer has and downloading new
 * ones a few at a time in the background, after the room scene synchronized, so
 * every owner texture becomes available for use.
 */
export class TexturesCollaborationPrefetch {
  private readonly libraryGet: () => TextureLibrary | null;
  private readonly request: (id: string) => Promise<void>;
  private readonly removed: (ids: ReadonlySet<string>) => void;
  private offered: Set<string> | null;
  private queue: string[];
  private running: number;
  private ready: boolean;

  /**
   * Creates the prefetch.
   *
   * @param libraryGet Returns the member's texture library.
   * @param request Downloads one texture; resolves when it arrived or failed.
   * @param removed Rebuilds nodes using textures the owner removed.
   */
  constructor(
    libraryGet: () => TextureLibrary | null,
    request: (id: string) => Promise<void>,
    removed: (ids: ReadonlySet<string>) => void,
  ) {
    this.libraryGet = libraryGet;
    this.request = request;
    this.removed = removed;
    this.offered = null;
    this.queue = [];
    this.running = 0;
    this.ready = false;
  }

  /**
   * Returns the textures the owner offers.
   *
   * @returns Texture ids, or null before the first index arrived.
   */
  offeredIds(): ReadonlySet<string> | null {
    return this.offered;
  }

  /**
   * Applies an index notice.
   *
   * @param ids Every texture the owner offers.
   */
  indexApply(ids: ReadonlySet<string>): void {
    this.offered = new Set(ids);
    const library = this.libraryGet();
    if (library === null) return;
    const gone = new Set(
      library
        .getEntries()
        .map((entry) => entry.id)
        .filter((id) => !isDefaultCheckerTextureId(id) && !ids.has(id)),
    );
    if (gone.size > 0 && library.entriesRemove(gone) > 0) this.removed(gone);
    this.queue = [...ids].filter((id) => library.getEntryById(id) === null);
    this.pump();
  }

  /** Starts downloading once the room scene synchronized. */
  start(): void {
    this.ready = true;
    if (this.offered !== null) this.indexApply(this.offered);
  }

  /** Stops downloading and forgets the index. */
  clear(): void {
    this.offered = null;
    this.queue = [];
    this.ready = false;
  }

  /** Starts downloads while slots are free. */
  private pump(): void {
    const library = this.libraryGet();
    while (this.ready && library !== null && this.running < TEXTURES_COLLABORATION_PREFETCH_PARALLEL) {
      const id = this.queue.shift();
      if (id === undefined) return;
      if (library.getEntryById(id) !== null) continue;
      this.running += 1;
      void this.request(id).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }
}
