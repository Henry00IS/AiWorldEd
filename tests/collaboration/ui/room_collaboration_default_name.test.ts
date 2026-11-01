import { describe, expect, it } from 'vitest';
import { roomCollaborationDefaultName } from '@/collaboration/ui/room_collaboration_default_name.js';
import { ROOM_NAME_LENGTH_MAXIMUM } from '@/collaboration/shared/room_name_policy.js';

describe('default room name', () => {
  it("adds 's to a name", () => {
    expect(roomCollaborationDefaultName('Henry')).toBe("Henry's room");
    expect(roomCollaborationDefaultName('  Ana  ')).toBe("Ana's room");
  });

  it("adds only ' to a name ending in s or S", () => {
    expect(roomCollaborationDefaultName('Slanders')).toBe("Slanders' room");
    expect(roomCollaborationDefaultName('JAMES')).toBe("JAMES' room");
  });

  it('falls back to My room without a name', () => {
    expect(roomCollaborationDefaultName('')).toBe('My room');
    expect(roomCollaborationDefaultName('   ')).toBe('My room');
  });

  it('stays within the room name limit', () => {
    const long = roomCollaborationDefaultName('x'.repeat(300));
    expect(Array.from(long)).toHaveLength(ROOM_NAME_LENGTH_MAXIMUM);
    expect(long.endsWith("'s room")).toBe(true);
    const emoji = roomCollaborationDefaultName('\u{1F600}'.repeat(200));
    expect(Array.from(emoji)).toHaveLength(ROOM_NAME_LENGTH_MAXIMUM);
  });
});
