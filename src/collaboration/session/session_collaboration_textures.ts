import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { StreamCollaborationIncoming } from '@/collaboration/net/stream_collaboration_receiver.js';
import type { StreamCollaborationSender } from '@/collaboration/net/stream_collaboration_sender.js';
import { createTextureBrowserEntry, type TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { textureCollaborationSniff } from '@/collaboration/session/texture_collaboration_sniff.js';
import { TexturesCollaborationPublisher } from '@/collaboration/session/publisher_collaboration_textures.js';
import {
  TEXTURES_COLLABORATION_INDEX_NAME,
  TexturesCollaborationIndexPublisher,
  TexturesCollaborationPrefetch,
} from '@/collaboration/session/index_collaboration_textures.js';
import {
  TEXTURES_COLLABORATION_REVISION_INTERVAL_MS,
  TEXTURES_COLLABORATION_REVISION_NAME,
  texturesCollaborationDigest,
  texturesCollaborationRevisionEncode,
  texturesCollaborationRevisionParse,
  texturesCollaborationStampSame,
} from '@/collaboration/session/revision_collaboration_textures.js';

/** Concurrent asset streams the owner sends to one member. */
export const TEXTURES_COLLABORATION_STREAMS_PER_MEMBER = 4;
/** Time a member waits for one texture before giving up. */
export const TEXTURES_COLLABORATION_TIMEOUT_MS = 60000;
/** Deepest payload nesting scanned for texture ids. */
const TEXTURES_COLLABORATION_DEPTH = 12;
/** Longest texture id the relay accepts as an asset name. */
const TEXTURES_COLLABORATION_NAME_MAXIMUM = 512;
/**
 * Asset streams the owner sends at once to all members together, so a bulk
 * download leaves room under the relay's message rate for edits and locks.
 */
export const TEXTURES_COLLABORATION_STREAMS_TOTAL = 8;
/** Asset requests one member may repeat for the same texture. */
export const TEXTURES_COLLABORATION_REPEATS_PER_MEMBER = 3;
/** Distinct textures one member may request from the owner. */
export const TEXTURES_COLLABORATION_DISTINCT_PER_MEMBER = 4096;
/** Largest revision notice a member parses. */
const TEXTURES_COLLABORATION_REVISION_BYTES_MAXIMUM = 4 * 1024 * 1024;

/**
 * Rebuilds nodes after a texture revision: the ids whose content changed, or
 * null after the owner's own folder changed.
 */
export type TexturesCollaborationRevised = (ids: ReadonlySet<string> | null) => void;

/** Queued asset request at the owner. */
interface TexturesCollaborationServe {
  to: number;
  name: string;
}

/**
 * Collects texture ids referenced by a payload: every string, or string array,
 * stored under a key containing "textureId".
 *
 * @param value Payload to scan.
 * @param into Receives texture ids.
 * @param depth Current nesting depth.
 */
export function texturesCollaborationCollect(value: unknown, into: Set<string>, depth: number = 0): void {
  if (depth > TEXTURES_COLLABORATION_DEPTH || typeof value !== 'object' || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item: unknown) => texturesCollaborationCollect(item, into, depth + 1));
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (/textureids?$/i.test(key)) texturesCollaborationAdd(item, into);
    else texturesCollaborationCollect(item, into, depth + 1);
  });
}

/**
 * Adds a texture id value (string or string array) to a set.
 *
 * @param value Id or id list.
 * @param into Receives valid ids.
 */
function texturesCollaborationAdd(value: unknown, into: Set<string>): void {
  const list = Array.isArray(value) ? value : [value];
  list.forEach((item: unknown) => {
    if (typeof item !== 'string' || item === '' || item.length > TEXTURES_COLLABORATION_NAME_MAXIMUM) return;
    if (!isDefaultCheckerTextureId(item)) into.add(item);
  });
}

/**
 * Returns the last path segment of a texture id.
 *
 * @param id Texture id (relative path).
 * @returns File name.
 */
export function texturesCollaborationFileName(id: string): string {
  const parts = id.split(/[\\/]/);
  return parts[parts.length - 1] || id;
}

/**
 * Texture transfer of a room. Only the owner is a texture source: it streams
 * library files on request, and when it opens or reloads a folder it tells each
 * member which received textures changed or vanished. Members request textures
 * their scene references but their library lacks, drop revised ones, fetch them
 * again, then re-apply the nodes that use them.
 */
export class TexturesCollaborationSession {
  private readonly transport: SessionCollaborationTransport;
  private readonly sender: StreamCollaborationSender;
  private readonly libraryGet: () => TextureLibrary | null;
  private readonly waiters: Map<string, Array<() => void>>;
  private readonly queue: TexturesCollaborationServe[];
  private readonly reading: Map<number, number>;
  private readonly requestCounts: Map<number, Map<string, number>>;
  private readonly publisher: TexturesCollaborationPublisher;
  private readonly index: TexturesCollaborationIndexPublisher;
  private readonly prefetch: TexturesCollaborationPrefetch;
  private indexAfter: number;
  private readonly refetch: Set<string>;
  private readonly revisionPending: Set<string>;
  private revisionAfter: number;
  private revisionAt: number;
  private revisionTimer: ReturnType<typeof setTimeout> | null;
  private arrived: (ids: ReadonlySet<string>) => void;
  private revised: TexturesCollaborationRevised;
  private referenced: () => ReadonlySet<string>;

  /**
   * Creates the texture transfer.
   *
   * @param transport Relay connection.
   * @param sender Owner stream sender.
   * @param libraryGet Returns the editor texture library.
   */
  constructor(
    transport: SessionCollaborationTransport,
    sender: StreamCollaborationSender,
    libraryGet: () => TextureLibrary | null = () => getTextureMapCache().getLibrary(),
  ) {
    this.transport = transport;
    this.sender = sender;
    this.libraryGet = libraryGet;
    this.waiters = new Map();
    this.queue = [];
    this.reading = new Map();
    this.requestCounts = new Map();
    this.refetch = new Set();
    this.revisionPending = new Set();
    this.revisionAfter = 0;
    this.revisionAt = -Infinity;
    this.revisionTimer = null;
    this.arrived = () => undefined;
    this.revised = () => undefined;
    this.referenced = () => new Set();
    this.publisher = new TexturesCollaborationPublisher(
      libraryGet,
      () => transport.limits.assetBytes,
      (to, changed, generation) => this.revisionDeliver(to, changed, generation),
    );
    [this.index, this.prefetch] = this.indexCreate();
    this.indexAfter = 0;
  }

  /**
   * Creates the owner's texture index publisher and the member's prefetch.
   *
   * @returns Publisher and prefetch.
   */
  private indexCreate(): [TexturesCollaborationIndexPublisher, TexturesCollaborationPrefetch] {
    const index = new TexturesCollaborationIndexPublisher(
      this.libraryGet,
      () => this.transport.limits.assetBytes,
      (to, bytes) => this.sender.start(to, 'asset', bytes, TEXTURES_COLLABORATION_INDEX_NAME, 'application/json'),
    );
    const prefetch = new TexturesCollaborationPrefetch(
      this.libraryGet,
      (id) => this.request(id),
      (ids) => {
        getTextureMapCache().forget(ids);
        this.revised(ids);
      },
    );
    return [index, prefetch];
  }

  /**
   * Sends a joining member the textures the owner offers (owner).
   *
   * @param to Member.
   */
  memberJoined(to: number): void {
    this.index.memberAdd(to);
  }

  /**
   * Starts downloading the owner's other textures once the scene synced
   * (member).
   */
  prefetchStart(): void {
    this.prefetch.start();
  }

  /**
   * Returns the textures the owner offers (member).
   *
   * @returns Texture ids, or null before the owner sent its index.
   */
  offeredIds(): ReadonlySet<string> | null {
    return this.prefetch.offeredIds();
  }

  /**
   * Sets the callbacks of texture revisions.
   *
   * @param revised Rebuilds nodes using revised textures.
   * @param referenced Returns the texture ids the scene (or a pending snapshot)
   *   uses.
   */
  revisionHooksSet(revised: TexturesCollaborationRevised, referenced: () => ReadonlySet<string>): void {
    this.revised = revised;
    this.referenced = referenced;
  }

  /** Notices a folder the owner opened or reloaded (owner, polled). */
  revisionPoll(): void {
    this.publisher.poll();
    this.index.poll();
  }

  /**
   * Sets the callback run after textures were added to the library.
   *
   * @param arrived Receives the new texture ids.
   */
  arrivedSet(arrived: (ids: ReadonlySet<string>) => void): void {
    this.arrived = arrived;
  }

  /**
   * Requests every texture the states reference that the library lacks.
   *
   * @param states Node states.
   * @returns Resolves when all requested textures arrived, failed or timed out.
   */
  ensure(states: readonly NodeCollaborationState[]): Promise<void> {
    const library = this.libraryGet();
    if (library === null) return Promise.resolve();
    const ids = new Set<string>();
    states.forEach((state) => texturesCollaborationCollect(state.data, ids));
    const missing = [...ids].filter((id) => library.getEntryById(id) === null);
    return Promise.all(missing.map((id) => this.request(id))).then(() => undefined);
  }

  /**
   * Stores a received texture and wakes its waiters. Textures this member did
   * not request, and files that are not a supported raster image within the
   * size limit, are dropped.
   *
   * @param incoming Completed asset stream.
   */
  received(incoming: StreamCollaborationIncoming): void {
    if (incoming.name === TEXTURES_COLLABORATION_REVISION_NAME) return this.revisionReceived(incoming.bytes);
    if (incoming.name === TEXTURES_COLLABORATION_INDEX_NAME) return this.indexReceived(incoming.bytes);
    if (!this.waiters.has(incoming.name)) return;
    if (this.refetch.delete(incoming.name)) return this.transport.send({ t: 'asset.request', name: incoming.name });
    const library = this.libraryGet();
    const sniffed = textureCollaborationSniff(incoming.bytes);
    if (library !== null && sniffed !== null) {
      const file = new File([new Uint8Array(incoming.bytes)], texturesCollaborationFileName(incoming.name), {
        type: sniffed.mime,
      });
      if (library.entriesAppend([createTextureBrowserEntry(file, incoming.name)]) > 0)
        this.arrived(new Set([incoming.name]));
    }
    this.settle(incoming.name);
  }

  /**
   * Gives up on a texture the owner cannot send. A texture revised while its
   * old content was in flight is requested again instead.
   *
   * @param name Texture id.
   */
  settle(name: string): void {
    if (this.refetch.delete(name)) return this.transport.send({ t: 'asset.request', name });
    const list = this.waiters.get(name);
    this.waiters.delete(name);
    list?.forEach((resolve) => resolve());
  }

  /**
   * Queues an asset request from a member (owner side).
   *
   * @param to Requesting member.
   * @param name Texture id.
   */
  serveQueue(to: number, name: string): void {
    if (!this.serveAdmit(to, name)) return;
    this.queue.push({ to, name });
    this.servePump();
  }

  /**
   * Counts a member's request and tells whether to serve it: a request already
   * queued, asked for too often, or beyond the distinct texture cap is ignored,
   * so a member cannot make the owner upload the same files without end.
   *
   * @param to Requesting member.
   * @param name Texture id.
   * @returns True when the request should be queued.
   */
  private serveAdmit(to: number, name: string): boolean {
    const counts = this.requestCounts.get(to) ?? new Map<string, number>();
    const count = counts.get(name) ?? 0;
    if (count >= TEXTURES_COLLABORATION_REPEATS_PER_MEMBER) return false;
    if (count === 0 && counts.size >= TEXTURES_COLLABORATION_DISTINCT_PER_MEMBER) return false;
    if (this.queue.some((item) => item.to === to && item.name === name)) return false;
    counts.set(name, count + 1);
    this.requestCounts.set(to, counts);
    return true;
  }

  /** Starts queued asset streams while members have free stream slots. */
  servePump(): void {
    for (
      let index = 0;
      index < this.queue.length && this.serveTotal() < TEXTURES_COLLABORATION_STREAMS_TOTAL;
      index++
    ) {
      const item = this.queue[index];
      if (item === undefined || this.serveCount(item.to) >= TEXTURES_COLLABORATION_STREAMS_PER_MEMBER) continue;
      this.queue.splice(index, 1);
      index -= 1;
      void this.serve(item);
    }
  }

  /**
   * Returns the streams being prepared or sent to all members.
   *
   * @returns Busy stream slots.
   */
  private serveTotal(): number {
    let reading = 0;
    this.reading.forEach((count) => (reading += count));
    return this.sender.activeCount() + reading;
  }

  /**
   * Returns the streams being prepared or sent to a member.
   *
   * @param to Member user id.
   * @returns Busy stream slots.
   */
  private serveCount(to: number): number {
    return this.sender.activeCountFor(to) + (this.reading.get(to) ?? 0);
  }

  /**
   * Forgets queued requests of a member that left.
   *
   * @param to Member user id.
   */
  forgetMember(to: number): void {
    this.requestCounts.delete(to);
    this.publisher.forgetMember(to);
    this.index.forgetMember(to);
    for (let index = this.queue.length - 1; index >= 0; index--) {
      if (this.queue[index]?.to === to) this.queue.splice(index, 1);
    }
  }

  /** Drops queued work and wakes every waiter. */
  clear(): void {
    this.queue.length = 0;
    this.requestCounts.clear();
    this.publisher.clear();
    this.index.clear();
    this.prefetch.clear();
    this.indexAfter = 0;
    this.refetch.clear();
    this.revisionPending.clear();
    if (this.revisionTimer !== null) clearTimeout(this.revisionTimer);
    this.revisionTimer = null;
    this.revisionAfter = 0;
    [...this.waiters.keys()].forEach((name) => this.settle(name));
  }

  /**
   * Requests one texture from the owner.
   *
   * @param id Texture id.
   * @returns Resolves when the texture arrived, failed or timed out.
   */
  private request(id: string): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(id), TEXTURES_COLLABORATION_TIMEOUT_MS);
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const list = this.waiters.get(id);
      if (list !== undefined) list.push(done);
      else {
        this.waiters.set(id, [done]);
        this.transport.send({ t: 'asset.request', name: id });
      }
    });
  }

  /**
   * Streams one library file to a member, or reports it missing. A request read
   * while the owner switched folders is queued again, so content of an older
   * folder never starts streaming after a revision notice.
   *
   * @param item Queued request.
   */
  private async serve(item: TexturesCollaborationServe): Promise<void> {
    const stamp = this.publisher.stamp();
    const entry = stamp.library?.getEntryById(item.name) ?? null;
    if (entry === null) return this.serveMissing(item);
    this.reading.set(item.to, (this.reading.get(item.to) ?? 0) + 1);
    const prepared = await this.serveRead(entry);
    this.reading.set(item.to, (this.reading.get(item.to) ?? 1) - 1);
    if (!texturesCollaborationStampSame(stamp, this.publisher.stamp())) this.queue.unshift(item);
    else if (prepared === null) return this.serveMissing(item);
    else {
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(entry.mimeType) ? entry.mimeType : 'application/octet-stream';
      this.publisher.hashes.remember(entry, prepared.tag);
      this.publisher.servedRecord(item.to, item.name, prepared.tag);
      this.sender.start(item.to, 'asset', prepared.bytes, item.name, mime, prepared.tag);
    }
    this.servePump();
  }

  /**
   * Reads and tags the bytes of a library file.
   *
   * @param entry Library entry.
   * @returns Bytes and content tag, or null when the file cannot be sent.
   */
  private async serveRead(entry: TextureBrowserEntry): Promise<{ bytes: Uint8Array; tag: string } | null> {
    const bytes = await entry.sourceFile.arrayBuffer().catch(() => null);
    if (bytes === null || bytes.byteLength === 0 || bytes.byteLength > this.transport.limits.assetBytes) return null;
    return { bytes: new Uint8Array(bytes), tag: await texturesCollaborationDigest(bytes) };
  }

  /**
   * Tells a member the owner cannot send a texture.
   *
   * @param item Queued request.
   */
  private serveMissing(item: TexturesCollaborationServe): void {
    this.publisher.servedRecord(item.to, item.name, null);
    this.transport.send({ t: 'asset.missing', to: item.to, name: item.name });
    this.servePump();
  }

  /**
   * Sends one member a revision notice, lets it fetch the listed textures again
   * and aborts streams still carrying their old content (owner).
   *
   * @param to Member.
   * @param changed New content tag per changed id (null when gone).
   * @param generation Revision generation.
   */
  private revisionDeliver(to: number, changed: ReadonlyMap<string, string | null>, generation: number): void {
    const ids = [...changed.keys()];
    this.sender.start(
      to,
      'asset',
      texturesCollaborationRevisionEncode(generation, ids),
      TEXTURES_COLLABORATION_REVISION_NAME,
      'application/json',
    );
    const counts = this.requestCounts.get(to);
    ids.forEach((id) => counts?.delete(id));
    this.sender.abortWhere(
      (info) =>
        info.to === to && info.name !== undefined && changed.has(info.name) && info.tag !== changed.get(info.name),
      'texture_revised',
    );
  }

  /**
   * Accepts a texture index from the owner (member); older or malformed notices
   * are ignored.
   *
   * @param bytes Notice bytes.
   */
  private indexReceived(bytes: Uint8Array): void {
    if (bytes.byteLength > TEXTURES_COLLABORATION_REVISION_BYTES_MAXIMUM) return;
    const notice = texturesCollaborationRevisionParse(bytes, this.indexAfter);
    if (notice === null) return;
    this.indexAfter = notice.generation;
    this.prefetch.indexApply(notice.ids);
  }

  /**
   * Accepts a revision notice from the owner (member); notices closer together
   * than the interval are merged and applied together.
   *
   * @param bytes Notice bytes.
   */
  private revisionReceived(bytes: Uint8Array): void {
    if (bytes.byteLength > TEXTURES_COLLABORATION_REVISION_BYTES_MAXIMUM) return;
    const notice = texturesCollaborationRevisionParse(bytes, this.revisionAfter);
    if (notice === null) return;
    this.revisionAfter = notice.generation;
    notice.ids.forEach((id) => this.revisionPending.add(id));
    const wait = this.revisionAt + TEXTURES_COLLABORATION_REVISION_INTERVAL_MS - Date.now();
    if (wait <= 0) this.revisionApply();
    else if (this.revisionTimer === null) this.revisionTimer = setTimeout(() => this.revisionApply(), wait);
  }

  /**
   * Drops revised textures, fetches the ones in use again (after any old
   * transfer in flight settles) and rebuilds the nodes that use them.
   */
  private revisionApply(): void {
    if (this.revisionTimer !== null) clearTimeout(this.revisionTimer);
    this.revisionTimer = null;
    this.revisionAt = Date.now();
    const ids = new Set(this.revisionPending);
    this.revisionPending.clear();
    this.libraryGet()?.entriesRemove(ids);
    getTextureMapCache().forget(ids);
    const used = this.referenced();
    ids.forEach((id) => {
      if (this.waiters.has(id)) this.refetch.add(id);
      else if (used.has(id)) void this.request(id);
    });
    this.revised(ids);
  }
}
