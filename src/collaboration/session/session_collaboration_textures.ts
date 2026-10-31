import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import type { StreamCollaborationIncoming } from '@/collaboration/net/stream_collaboration_receiver.js';
import type { StreamCollaborationSender } from '@/collaboration/net/stream_collaboration_sender.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';

/** Concurrent asset streams the owner sends to one member. */
export const TEXTURES_COLLABORATION_STREAMS_PER_MEMBER = 4;
/** Time a member waits for one texture before giving up. */
export const TEXTURES_COLLABORATION_TIMEOUT_MS = 60000;
/** Deepest payload nesting scanned for texture ids. */
const TEXTURES_COLLABORATION_DEPTH = 12;
/** Longest texture id the relay accepts as an asset name. */
const TEXTURES_COLLABORATION_NAME_MAXIMUM = 512;

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
 * Texture transfer of a room. The owner streams library files on request;
 * members request textures their scene references but their library lacks, then
 * re-apply the nodes that use them.
 */
export class TexturesCollaborationSession {
  private readonly transport: SessionCollaborationTransport;
  private readonly sender: StreamCollaborationSender;
  private readonly libraryGet: () => TextureLibrary | null;
  private readonly waiters: Map<string, Array<() => void>>;
  private readonly queue: TexturesCollaborationServe[];
  private readonly reading: Map<number, number>;
  private arrived: (ids: ReadonlySet<string>) => void;

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
    this.arrived = () => undefined;
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
   * Stores a received texture and wakes its waiters.
   *
   * @param incoming Completed asset stream.
   */
  received(incoming: StreamCollaborationIncoming): void {
    const library = this.libraryGet();
    if (library !== null && incoming.name !== '') {
      const file = new File([new Uint8Array(incoming.bytes)], texturesCollaborationFileName(incoming.name), {
        type: incoming.mime || 'application/octet-stream',
      });
      if (library.entriesAppend([createTextureBrowserEntry(file, incoming.name)]) > 0)
        this.arrived(new Set([incoming.name]));
    }
    this.settle(incoming.name);
  }

  /**
   * Gives up on a texture the owner cannot send.
   *
   * @param name Texture id.
   */
  settle(name: string): void {
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
    this.queue.push({ to, name });
    this.servePump();
  }

  /** Starts queued asset streams while members have free stream slots. */
  servePump(): void {
    for (let index = 0; index < this.queue.length; index++) {
      const item = this.queue[index];
      if (item === undefined || this.serveCount(item.to) >= TEXTURES_COLLABORATION_STREAMS_PER_MEMBER) continue;
      this.queue.splice(index, 1);
      index -= 1;
      void this.serve(item);
    }
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
    for (let index = this.queue.length - 1; index >= 0; index--) {
      if (this.queue[index]?.to === to) this.queue.splice(index, 1);
    }
  }

  /** Drops queued work and wakes every waiter. */
  clear(): void {
    this.queue.length = 0;
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
   * Streams one library file to a member, or reports it missing.
   *
   * @param item Queued request.
   */
  private async serve(item: TexturesCollaborationServe): Promise<void> {
    const entry = this.libraryGet()?.getEntryById(item.name) ?? null;
    const limit = this.transport.limits.assetBytes;
    this.reading.set(item.to, (this.reading.get(item.to) ?? 0) + 1);
    const bytes = entry === null ? null : await entry.sourceFile.arrayBuffer().catch(() => null);
    this.reading.set(item.to, (this.reading.get(item.to) ?? 1) - 1);
    if (entry === null || bytes === null || bytes.byteLength === 0 || bytes.byteLength > limit) {
      this.transport.send({ t: 'asset.missing', to: item.to, name: item.name });
      this.servePump();
      return;
    }
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(entry.mimeType) ? entry.mimeType : 'application/octet-stream';
    this.sender.start(item.to, 'asset', new Uint8Array(bytes), item.name, mime);
    this.servePump();
  }
}
