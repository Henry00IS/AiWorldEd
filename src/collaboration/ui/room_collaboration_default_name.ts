import { ROOM_NAME_LENGTH_MAXIMUM } from '@/collaboration/shared/room_name_policy.js';

/** Default room name when no display name is set. */
export const ROOM_COLLABORATION_DEFAULT_NAME = 'My room';

/**
 * Suggests a room name from the display name: "Henry's room", or "James' room"
 * for a name ending in s, or "My room" without a name. The result fits the room
 * name limit (counted in code points).
 *
 * @param displayName Stored display name.
 * @returns Suggested room name.
 */
export function roomCollaborationDefaultName(displayName: string): string {
  const name = displayName.trim();
  if (name === '') return ROOM_COLLABORATION_DEFAULT_NAME;
  const suffix = /s$/i.test(name) ? "' room" : "'s room";
  const room = Array.from(suffix);
  const owner = Array.from(name).slice(0, ROOM_NAME_LENGTH_MAXIMUM - room.length);
  return [...owner, ...room].join('');
}
