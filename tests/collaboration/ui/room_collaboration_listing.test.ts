import { describe, expect, it } from 'vitest';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';
import {
  roomCollaborationDisplayName,
  roomCollaborationListingApply,
  roomCollaborationMatches,
  roomCollaborationPossessive,
} from '@/collaboration/ui/room_collaboration_listing.js';

/**
 * Builds a listed room.
 *
 * @param id Room id.
 * @param name Room name.
 * @param owner Owner display name.
 * @returns Room.
 */
function room(id: string, name: string, owner: string): SessionCollaborationRoomInfo {
  return { id, name, owner, private: false, users: 1, maxUsers: 8 };
}

/** Owner display and search for the room list. */
describe('room_collaboration_listing', () => {
  it('forms possessives, with only an apostrophe after a trailing s', () => {
    expect(roomCollaborationPossessive('Henry')).toBe("Henry's");
    expect(roomCollaborationPossessive('Slanders')).toBe("Slanders'");
    expect(roomCollaborationPossessive('JAMES')).toBe("JAMES'");
  });

  it('prefixes the owner unless the name already contains it (any case)', () => {
    expect(roomCollaborationDisplayName(room('a', 'Awesome room', 'Henry'))).toBe("Henry's Awesome room");
    expect(roomCollaborationDisplayName(room('a', 'Awesome room', 'Slanders'))).toBe("Slanders' Awesome room");
    expect(roomCollaborationDisplayName(room('a', "henry's room", 'Henry'))).toBe("henry's room");
    expect(roomCollaborationDisplayName(room('a', 'Lab', ''))).toBe('Lab');
  });

  it('matches the search against name or owner, case-insensitively', () => {
    const lab = room('a', 'Level Lab', 'Slanders');
    expect(roomCollaborationMatches(lab, '')).toBe(true);
    expect(roomCollaborationMatches(lab, '  lab ')).toBe(true);
    expect(roomCollaborationMatches(lab, 'SLAND')).toBe(true);
    expect(roomCollaborationMatches(lab, 'henry')).toBe(false);
  });

  it('applies a delta: removed ids first, then added or changed rooms', () => {
    const rooms = new Map([
      ['a', room('a', 'A', 'x')],
      ['b', room('b', 'B', 'x')],
    ]);
    roomCollaborationListingApply(rooms, { rooms: [room('b', 'B2', 'x'), room('c', 'C', 'y')], removed: ['a'] });
    expect([...rooms.values()].map((each) => each.name)).toEqual(['B2', 'C']);
  });
});
