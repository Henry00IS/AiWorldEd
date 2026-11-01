import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import {
  sessionCollaborationRoomParse,
  type SessionCollaborationRoomInfo,
} from '@/collaboration/session/session_collaboration_types.js';
import { roomCollaborationListingApply } from '@/collaboration/ui/room_collaboration_listing.js';

/** Receives the live room list while the room browser is open. */
export interface RuntimeCollaborationRoomsWatcher {
  /**
   * The room list changed.
   *
   * @param rooms Every listed room.
   */
  update(rooms: SessionCollaborationRoomInfo[]): void;
  /**
   * The connection dropped, so the live list ended.
   *
   * @param error Reason.
   */
  lost(error: Error): void;
}

/**
 * Parses a list of untrusted room descriptions.
 *
 * @param value Untrusted value.
 * @returns Valid rooms.
 */
export function runtimeCollaborationRoomsParse(value: unknown): SessionCollaborationRoomInfo[] {
  const rooms = Array.isArray(value) ? value : [];
  return rooms.map(sessionCollaborationRoomParse).filter((room) => room !== null);
}

/**
 * Holds the live room list of one `room.subscribe` subscription and applies the
 * relay's `room.list.update` deltas to it.
 */
export class RuntimeCollaborationRoomsWatch {
  private readonly rooms: Map<string, SessionCollaborationRoomInfo>;
  private watcher: RuntimeCollaborationRoomsWatcher | null;

  /** Creates an inactive watch. */
  constructor() {
    this.rooms = new Map();
    this.watcher = null;
  }

  /**
   * Tells whether a watcher is attached.
   *
   * @returns True while subscribed.
   */
  active(): boolean {
    return this.watcher !== null;
  }

  /**
   * Starts watching from the full list in `room.subscribed`.
   *
   * @param watcher Receives the list.
   * @param reply The `room.subscribed` reply.
   */
  start(watcher: RuntimeCollaborationRoomsWatcher, reply: SocketCollaborationMessage): void {
    this.rooms.clear();
    for (const room of runtimeCollaborationRoomsParse(reply['rooms'])) this.rooms.set(room.id, room);
    this.watcher = watcher;
    watcher.update([...this.rooms.values()]);
  }

  /**
   * Applies a `room.list.update` delta and reports the new list.
   *
   * @param message The update.
   */
  apply(message: SocketCollaborationMessage): void {
    if (this.watcher === null) return;
    const removed = Array.isArray(message['removed'])
      ? message['removed'].filter((roomId): roomId is string => typeof roomId === 'string')
      : [];
    roomCollaborationListingApply(this.rooms, { rooms: runtimeCollaborationRoomsParse(message['rooms']), removed });
    this.watcher.update([...this.rooms.values()]);
  }

  /** Stops watching without notifying the watcher. */
  stop(): void {
    this.watcher = null;
    this.rooms.clear();
  }

  /**
   * Ends the watch because the connection dropped.
   *
   * @param error Reason.
   */
  lose(error: Error): void {
    const watcher = this.watcher;
    this.stop();
    watcher?.lost(error);
  }
}
