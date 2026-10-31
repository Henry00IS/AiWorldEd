import type {
  SocketCollaborationLimits,
  SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';

/** Connection services a room session uses. */
export interface SessionCollaborationTransport {
  /** Relay limits from the welcome message. */
  readonly limits: SocketCollaborationLimits;
  /**
   * Sends a JSON message.
   *
   * @param message Message object.
   */
  send(message: object): void;
  /**
   * Sends a binary frame.
   *
   * @param frame Frame bytes.
   */
  sendBinary(frame: Uint8Array): void;
  /**
   * Sends a message and waits for the reply carrying the same `r`.
   *
   * @param message Message without `r`.
   * @param timeoutMs Reply timeout.
   * @returns Reply message.
   */
  request(message: object, timeoutMs?: number): Promise<SocketCollaborationMessage>;
}

/** Notifications from a room session to the runtime. */
export interface SessionCollaborationEvents {
  /** The scene finished synchronizing and editing is allowed. */
  synced(): void;
  /** Members or their locks changed. */
  rosterChanged(): void;
  /**
   * Synchronization failed and the room must be left.
   *
   * @param message Reason shown to the user.
   */
  failed(message: string): void;
}

/** Member entry from room.joined. */
export interface SessionCollaborationMember {
  user: number;
  name: string;
  owner: boolean;
  /** Color slot assigned by the relay. */
  color: number;
}

/** Room description from room.list, room.created and room.joined. */
export interface SessionCollaborationRoomInfo {
  id: string;
  name: string;
  private: boolean;
  users: number;
  maxUsers: number;
}

/**
 * Parses a room description.
 *
 * @param value Untrusted value.
 * @returns Room info, or null when malformed.
 */
export function sessionCollaborationRoomParse(value: unknown): SessionCollaborationRoomInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const room = value as Record<string, unknown>;
  if (typeof room['id'] !== 'string' || typeof room['name'] !== 'string') return null;
  return {
    id: room['id'],
    name: room['name'],
    private: room['private'] === true,
    users: typeof room['users'] === 'number' ? room['users'] : 0,
    maxUsers: typeof room['maxUsers'] === 'number' ? room['maxUsers'] : 0,
  };
}

/**
 * Parses a member list.
 *
 * @param value Untrusted value.
 * @returns Valid members.
 */
export function sessionCollaborationMembersParse(value: unknown): SessionCollaborationMember[] {
  if (!Array.isArray(value)) return [];
  const members: SessionCollaborationMember[] = [];
  value.forEach((item: unknown) => {
    if (typeof item !== 'object' || item === null) return;
    const member = item as Record<string, unknown>;
    if (typeof member['user'] !== 'number' || typeof member['name'] !== 'string') return;
    const color = sessionCollaborationSlot(member['color']);
    members.push({ user: member['user'], name: member['name'], owner: member['owner'] === true, color });
  });
  return members;
}

/**
 * Parses a color slot.
 *
 * @param value Untrusted value.
 * @returns Non-negative slot, 0 when missing or malformed.
 */
export function sessionCollaborationSlot(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * Returns a string array from an untrusted value.
 *
 * @param value Untrusted value.
 * @returns Strings found in the array.
 */
export function sessionCollaborationStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}
