import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';
import { PROTOCOL_VERSION_MAXIMUM, PROTOCOL_VERSION_MINIMUM } from '@/collaboration/shared/protocol_versioning.js';

/** Live room list delta pushed by the relay in `room.list.update`. */
export interface RoomCollaborationListingUpdate {
  rooms: readonly SessionCollaborationRoomInfo[];
  removed: readonly string[];
}

/**
 * Builds the possessive form of a name: "Henry's", or "Slanders'" for a name
 * ending in s.
 *
 * @param ownerName Display name.
 * @returns Possessive form.
 */
export function roomCollaborationPossessive(ownerName: string): string {
  return /s$/i.test(ownerName) ? `${ownerName}'` : `${ownerName}'s`;
}

/**
 * Builds the label shown for a room in the browser: "<owner>'s <room>" unless
 * the room name already contains the owner's display name (case-insensitive).
 * Display only: the room name itself is never changed.
 *
 * @param room Room.
 * @returns Label.
 */
export function roomCollaborationDisplayName(room: SessionCollaborationRoomInfo): string {
  const ownerName = room.owner.trim();
  if (ownerName === '') return room.name;
  if (room.name.toLocaleLowerCase().includes(ownerName.toLocaleLowerCase())) return room.name;
  return `${roomCollaborationPossessive(ownerName)} ${room.name}`;
}

/**
 * Tests whether a room matches the search text, case-insensitive, on the room
 * name and the owner name. Empty search text matches every room.
 *
 * @param room Room.
 * @param searchText Text typed in the search box.
 * @returns True when the room should be listed.
 */
export function roomCollaborationMatches(room: SessionCollaborationRoomInfo, searchText: string): boolean {
  const needle = searchText.trim().toLocaleLowerCase();
  if (needle === '') return true;
  return room.name.toLocaleLowerCase().includes(needle) || room.owner.toLocaleLowerCase().includes(needle);
}

/**
 * Applies a live list delta: replaces or adds the changed rooms and drops the
 * removed ids.
 *
 * @param current Rooms by id, updated in place.
 * @param update Delta from the relay.
 */
export function roomCollaborationListingApply(
  current: Map<string, SessionCollaborationRoomInfo>,
  update: RoomCollaborationListingUpdate,
): void {
  for (const roomId of update.removed) current.delete(roomId);
  for (const room of update.rooms) current.set(room.id, room);
}

/**
 * Tests whether this editor can join a room: the room protocol must lie in the
 * range this editor speaks. A room without a version (older relay) is assumed
 * compatible; the relay still refuses a real mismatch at join time.
 *
 * @param room Room.
 * @returns True when the editor speaks the room protocol.
 */
export function roomCollaborationCompatible(room: SessionCollaborationRoomInfo): boolean {
  if (room.protocol === 0) return true;
  return room.protocol >= PROTOCOL_VERSION_MINIMUM && room.protocol <= PROTOCOL_VERSION_MAXIMUM;
}

/**
 * Describes the protocol and editor build of a room for the room list.
 *
 * @param room Room.
 * @returns Label such as "v2 · aiworlded-editor/1.0.0".
 */
export function roomCollaborationVersionLabel(room: SessionCollaborationRoomInfo): string {
  const version = room.protocol > 0 ? `v${room.protocol}` : 'v?';
  return room.editor === '' ? version : `${version} \u00b7 ${room.editor}`;
}
