import { describe, expect, it } from 'vitest';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';
import {
  roomCollaborationDisplayName,
  roomCollaborationListingApply,
  roomCollaborationMatches,
  roomCollaborationPossessive,
  roomCollaborationCompatible,
  roomCollaborationVersionLabel,
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
  return { id, name, owner, private: false, users: 1, maxUsers: 8, protocol: 2, editor: 'aiworlded-editor/1.0.0' };
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

/** Protocol versions in the room list. */
describe('room_collaboration_listing versions', () => {
  it('labels the protocol and editor build, and flags rooms this editor cannot join', () => {
    const current = room('a', 'Map', 'Henry');
    expect(roomCollaborationVersionLabel(current)).toBe('v2 \u00b7 aiworlded-editor/1.0.0');
    expect(roomCollaborationCompatible(current)).toBe(true);
    expect(roomCollaborationCompatible({ ...current, protocol: 1 })).toBe(false);
    expect(roomCollaborationCompatible({ ...current, protocol: 3 })).toBe(false);
    expect(roomCollaborationCompatible({ ...current, protocol: 0 })).toBe(true);
    expect(roomCollaborationVersionLabel({ ...current, protocol: 0, editor: '' })).toBe('v?');
  });
});
