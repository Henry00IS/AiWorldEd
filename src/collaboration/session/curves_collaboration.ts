import {
  curveLibraryChanged,
  curveLibraryFileNameValid,
  curveLibraryListen,
  type CurveLibraryEntry,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';

/** Channel tag of curve messages on the room's custom channel. */
export const CURVES_COLLABORATION_CHANNEL = 'aiworlded.curves';
/** Largest curve file shared through a room, in bytes. */
export const CURVES_COLLABORATION_FILE_MAXIMUM = 64 * 1024;
/** Largest curve list message, in bytes (the relay allows 256 KiB). */
const CURVES_COLLABORATION_MESSAGE_MAXIMUM = 192 * 1024;
/** Why members cannot change the room owner's curves. */
export const CURVES_COLLABORATION_REMOTE_READ_ONLY = "The room owner's curves are read-only; save to Local instead.";
/**
 * Name of the asset request a member sends for the owner's curve list. It goes
 * as an asset request, which every member may send (the relay refuses custom
 * messages from viewers); the owner's session hands it to the curve sync.
 */
export const CURVES_COLLABORATION_REQUEST_NAME = 'aiworlded:curves-list';

/** Member: wait for the owner's list before asking again. */
export const CURVES_COLLABORATION_REQUEST_RETRY_MS = 5000;
/** Member: list requests per room session before giving up. */
const CURVES_COLLABORATION_REQUEST_ATTEMPTS = 5;
/** Owner: shortest time between two lists sent to one member on request. */
export const CURVES_COLLABORATION_REQUEST_INTERVAL_MS = 2000;
/** Owner: list requests answered per member and room session. */
export const CURVES_COLLABORATION_REQUESTS_PER_MEMBER = 10;

/** One shared curve. */
interface CurvesCollaborationFile {
  /** File name. */
  f: string;
  /** Last change in milliseconds. */
  m: number;
  /** File text. */
  x: string;
}

/** Curve messages of a room. */
export type CurvesCollaborationMessage =
  | {
      c: typeof CURVES_COLLABORATION_CHANNEL;
      t: 'list';
      reset: boolean;
      more: boolean;
      curves: CurvesCollaborationFile[];
    }
  | ({ c: typeof CURVES_COLLABORATION_CHANNEL; t: 'put' } & CurvesCollaborationFile)
  | { c: typeof CURVES_COLLABORATION_CHANNEL; t: 'remove'; f: string };

/** A member as the curve sync needs it. */
export interface CurvesCollaborationMember {
  user: number;
  owner: boolean;
}

/** The room's opaque owner/member channel. */
export interface CurvesCollaborationChannel {
  sendToOwner(payload: Uint8Array): Promise<unknown>;
  sendToMember(member: number, payload: Uint8Array): Promise<unknown>;
  sendToAll(payload: Uint8Array): Promise<unknown>;
  onMessage(listener: (from: number, payload: Uint8Array) => void): () => void;
}

/** What the curve sync needs from the room and the editor. */
export interface CurvesCollaborationDeps {
  channel: CurvesCollaborationChannel;
  /** The owner's own AiWorldEd/Curves, or null. */
  projectSource: () => CurveLibrarySource | null;
  /** Registers the remote source of a member, or removes it. */
  remoteSet: (source: CurveLibrarySource | null) => void;
  /** Timer, injectable for tests. */
  setTimer?: (run: () => void, ms: number) => unknown;
  /** Clears a timer. */
  clearTimer?: (timer: unknown) => void;
  /** Clock in milliseconds, injectable for tests. */
  now?: () => number;
  /**
   * Member: asks the owner for the curve list
   * ({@link CURVES_COLLABORATION_REQUEST_NAME}).
   */
  requestSend?: () => void;
}

/** The room the sync runs in. */
export interface CurvesCollaborationRoom {
  self: number;
  owner: boolean;
  members: readonly CurvesCollaborationMember[];
}

/**
 * Shares the room owner's AiWorldEd/Curves with the members over the room's
 * custom channel, so the relay only passes bytes along.
 *
 * - A member asks the owner for the whole list once its own side of the room is
 *   ready (the channel drops what arrives earlier), and asks again while no
 *   list came. The owner answers only by sending the list it shares, from
 *   memory, to that member, at most every few seconds and a few times per
 *   member. Each change (save, edit on disk, delete) then goes to everyone.
 * - Members keep the list in memory and show it as "Remote", read-only for every
 *   member whatever their role: they browse and load it, and save or copy into
 *   their own Local curves. Nothing members send is ever written into the
 *   owner's project; the owner ignores every curve message and only answers
 *   list requests.
 */
export class CurvesCollaboration {
  private room: CurvesCollaborationRoom | null = null;
  private unlisten: (() => void) | null = null;
  private readonly unsubscribe: () => void;
  /** Owner: the curves as last shared. */
  private readonly shared = new Map<string, CurvesCollaborationFile>();
  /** Owner: list requests answered per member, and when the last one was. */
  private readonly requests = new Map<number, { count: number; at: number }>();
  /** Member: pending list request retry. */
  private requestTimer: unknown = null;
  /** Member: list requests sent this room session. */
  private requestCount = 0;
  /**
   * Counts room sessions. The editor passes a new room object on every state or
   * roster change, so work that waits compares this, not the object.
   */
  private session = 0;
  /** Owner: publishing in order. */
  private publishing: Promise<void> = Promise.resolve();
  /** Member: the owner's curves. */
  private remote = new Map<string, CurvesCollaborationFile>();
  /** Member: the list while it arrives in parts. */
  private incoming: Map<string, CurvesCollaborationFile> | null = null;
  private readonly setTimer: (run: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly now: () => number;

  /**
   * Creates the sync; nothing happens before {@link roomSet}.
   *
   * @param deps Channel and editor services.
   */
  constructor(private readonly deps: CurvesCollaborationDeps) {
    this.setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
    this.clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.now = deps.now ?? (() => Date.now());
    this.unsubscribe = deps.channel.onMessage((from, payload) => this.received(from, payload));
  }

  /**
   * Follows the room: entered, roster changed or left.
   *
   * @param room Room, or null after leaving.
   */
  roomSet(room: CurvesCollaborationRoom | null): void {
    const previous = this.room;
    // A new room, role or connection (a reconnect gives a new id) starts over.
    const restart = room === null || previous === null || previous.owner !== room.owner || previous.self !== room.self;
    if (restart) this.stop();
    this.room = room;
    if (room === null) return;
    if (room.owner) return this.ownerRoster(restart);
    if (!restart) return curveLibraryChanged();
    this.deps.remoteSet(this.remoteSource());
    this.listRequest();
  }

  /** Leaves the room and stops listening. */
  dispose(): void {
    this.roomSet(null);
    this.unsubscribe();
  }

  /**
   * Returns the owner's curves as a member sees them (for tests).
   *
   * @returns File names.
   */
  remoteNames(): string[] {
    return [...this.remote.keys()].sort();
  }

  /** Forgets the room state. */
  private stop(): void {
    this.session += 1;
    this.unlisten?.();
    this.unlisten = null;
    this.requests.clear();
    if (this.requestTimer !== null) this.clearTimer(this.requestTimer);
    this.requestTimer = null;
    this.requestCount = 0;
    this.shared.clear();
    this.remote = new Map();
    this.incoming = null;
    if (this.room !== null && !this.room.owner) this.deps.remoteSet(null);
  }

  /**
   * Owner: starts sharing, and forgets the requests of members that left.
   *
   * @param starting True when this room session just started.
   */
  private ownerRoster(starting: boolean): void {
    if (starting) {
      this.unlisten = curveLibraryListen(() => this.publishQueue());
      this.publishQueue();
    }
    const members = new Set(this.room?.members.filter((member) => !member.owner).map((member) => member.user));
    for (const user of [...this.requests.keys()]) if (!members.has(user)) this.requests.delete(user);
  }

  /**
   * Owner: answers a member's list request by sending it the shared list from
   * memory, at once: a publish in progress updates the shared list before it
   * sends anything, and its changes reach the member as puts afterwards.
   * Requests from anyone but a member of the roster, too soon after the last
   * one, or beyond the per-member cap are ignored.
   *
   * @param user Requesting member.
   */
  requested(user: number): void {
    const room = this.room;
    if (room === null || !room.owner || !room.members.some((member) => !member.owner && member.user === user)) return;
    const now = this.now();
    const last = this.requests.get(user);
    if (
      last !== undefined &&
      (now - last.at < CURVES_COLLABORATION_REQUEST_INTERVAL_MS ||
        last.count >= CURVES_COLLABORATION_REQUESTS_PER_MEMBER)
    )
      return;
    this.requests.set(user, { count: (last?.count ?? 0) + 1, at: now });
    const session = this.session;
    const messages = this.listMessages();
    void (async () => {
      for (const message of messages)
        if (this.session === session) await this.deps.channel.sendToMember(user, curvesEncode(message));
    })().catch(() => undefined);
  }

  /** Member: asks the owner for the list, and again while none arrived. */
  private listRequest(): void {
    const room = this.room;
    const session = this.session;
    if (room === null || room.owner || this.requestCount >= CURVES_COLLABORATION_REQUEST_ATTEMPTS) return;
    this.requestCount += 1;
    try {
      this.deps.requestSend?.();
    } catch {
      // Asked again below.
    }
    this.requestTimer = this.setTimer(() => {
      this.requestTimer = null;
      if (this.session === session) this.listRequest();
    }, CURVES_COLLABORATION_REQUEST_RETRY_MS);
  }

  /**
   * Owner: splits the shared curves into list messages under the size limit.
   *
   * @returns Messages, at least one.
   */
  private listMessages(): CurvesCollaborationMessage[] {
    const parts: CurvesCollaborationFile[][] = [[]];
    let bytes = 0;
    for (const file of [...this.shared.values()].sort((a, b) => a.f.localeCompare(b.f))) {
      const size = file.x.length + file.f.length + 32;
      if (bytes + size > CURVES_COLLABORATION_MESSAGE_MAXIMUM && parts[parts.length - 1]!.length > 0) {
        parts.push([]);
        bytes = 0;
      }
      parts[parts.length - 1]!.push(file);
      bytes += size;
    }
    return parts.map((curves, index) => ({
      c: CURVES_COLLABORATION_CHANNEL,
      t: 'list',
      reset: index === 0,
      more: index < parts.length - 1,
      curves,
    }));
  }

  /** Owner: shares what changed in AiWorldEd/Curves, one run at a time. */
  private publishQueue(): void {
    this.publishing = this.publishing.then(() => this.publish()).catch(() => undefined);
  }

  /**
   * Owner: compares the project's curves with the shared ones and sends
   * changes.
   */
  private async publish(): Promise<void> {
    const room = this.room;
    if (room === null || !room.owner) return;
    const session = this.session;
    const source = this.deps.projectSource();
    const entries = (source?.list() ?? []).filter(
      (entry) => curveLibraryFileNameValid(entry.fileName) && entry.size <= CURVES_COLLABORATION_FILE_MAXIMUM,
    );
    const names = new Set(entries.map((entry) => entry.fileName));
    const messages: CurvesCollaborationMessage[] = [];
    for (const name of [...this.shared.keys()])
      if (!names.has(name)) {
        this.shared.delete(name);
        messages.push({ c: CURVES_COLLABORATION_CHANNEL, t: 'remove', f: name });
      }
    for (const entry of entries) {
      if (this.shared.get(entry.fileName)?.m === entry.lastModified) continue;
      const text = await source!.read(entry.fileName).catch(() => null);
      if (text === null || text.length > CURVES_COLLABORATION_FILE_MAXIMUM) continue;
      const file = { f: entry.fileName, m: entry.lastModified, x: text };
      if (this.shared.get(entry.fileName)?.x === text) {
        this.shared.set(entry.fileName, file);
        continue;
      }
      this.shared.set(entry.fileName, file);
      messages.push({ c: CURVES_COLLABORATION_CHANNEL, t: 'put', ...file });
    }
    if (this.session !== session || (this.room?.members ?? []).every((member) => member.owner)) return;
    for (const message of messages) await this.deps.channel.sendToAll(curvesEncode(message)).catch(() => undefined);
  }

  /**
   * Handles a curve message.
   *
   * @param from Sender.
   * @param payload Bytes.
   */
  private received(from: number, payload: Uint8Array): void {
    const room = this.room;
    const message = curvesDecode(payload);
    // The owner's curves change only from its own project: members cannot write them.
    if (room === null || message === null || room.owner) return;
    if (!room.members.some((member) => member.owner && member.user === from)) return;
    if (message.t === 'list') this.listReceived(message);
    else if (message.t === 'put' && curvesFileValid(message)) {
      this.remote.set(message.f, { f: message.f, m: message.m, x: message.x });
      curveLibraryChanged();
    } else if (message.t === 'remove') {
      this.remote.delete(message.f);
      curveLibraryChanged();
    }
  }

  /**
   * Member: takes one part of the owner's list.
   *
   * @param message List part.
   */
  private listReceived(message: Extract<CurvesCollaborationMessage, { t: 'list' }>): void {
    if (message.reset) this.incoming = new Map();
    if (this.incoming === null || !Array.isArray(message.curves)) return;
    message.curves.filter(curvesFileValid).forEach((file) => this.incoming!.set(file.f, file));
    if (message.more) return;
    this.remote = this.incoming;
    this.incoming = null;
    if (this.requestTimer !== null) this.clearTimer(this.requestTimer);
    this.requestTimer = null;
    curveLibraryChanged();
  }

  /**
   * Member: the owner's curves as a curve source.
   *
   * @returns Source.
   */
  private remoteSource(): CurveLibrarySource {
    return {
      id: 'remote',
      writable: () => false,
      readOnlyReason: () => CURVES_COLLABORATION_REMOTE_READ_ONLY,
      list: (): CurveLibraryEntry[] =>
        [...this.remote.values()].map((file) => ({ fileName: file.f, size: file.x.length, lastModified: file.m })),
      read: async (fileName) => {
        const file = this.remote.get(fileName);
        if (!file) throw new Error(`${fileName} is not in the room owner's curves.`);
        return file.x;
      },
      write: async () => {
        throw new Error(CURVES_COLLABORATION_REMOTE_READ_ONLY);
      },
    };
  }
}

/**
 * Returns whether a shared curve is well formed.
 *
 * @param file Shared curve.
 * @returns True when valid.
 */
function curvesFileValid(file: Partial<CurvesCollaborationFile>): file is CurvesCollaborationFile {
  return (
    typeof file.f === 'string' &&
    curveLibraryFileNameValid(file.f) &&
    typeof file.m === 'number' &&
    typeof file.x === 'string' &&
    file.x.length <= CURVES_COLLABORATION_FILE_MAXIMUM
  );
}

/**
 * Encodes a curve message.
 *
 * @param message Message.
 * @returns Bytes.
 */
export function curvesEncode(message: CurvesCollaborationMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message));
}

/**
 * Decodes a curve message; other custom traffic gives null.
 *
 * @param payload Bytes.
 * @returns Message, or null.
 */
export function curvesDecode(payload: Uint8Array): CurvesCollaborationMessage | null {
  try {
    const message = JSON.parse(new TextDecoder().decode(payload)) as Partial<CurvesCollaborationMessage> | null;
    return message?.c === CURVES_COLLABORATION_CHANNEL && typeof message.t === 'string'
      ? (message as CurvesCollaborationMessage)
      : null;
  } catch {
    return null;
  }
}
