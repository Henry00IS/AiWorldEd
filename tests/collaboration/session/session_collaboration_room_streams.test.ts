import { describe, expect, it } from 'vitest';
import { sessionCollaborationStreamAccepted } from '@/collaboration/session/session_collaboration_room.js';

describe('sessionCollaborationStreamAccepted', () => {
  it('lets the owner take only credits and aborts of its own streams', () => {
    for (const type of ['stream.begin', 'stream.end'])
      expect(sessionCollaborationStreamAccepted(true, type)).toBe(false);
    for (const type of ['stream.credit', 'stream.abort'])
      expect(sessionCollaborationStreamAccepted(true, type)).toBe(true);
  });

  it('lets members receive every stream message', () => {
    for (const type of ['stream.begin', 'stream.end', 'stream.credit', 'stream.abort'])
      expect(sessionCollaborationStreamAccepted(false, type)).toBe(true);
  });
});
