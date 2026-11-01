import { describe, expect, it } from 'vitest';
import {
  RuntimeCollaborationRoomsWatch,
  runtimeCollaborationRoomsParse,
} from '@/collaboration/runtime/runtime_collaboration_rooms_watch.js';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';

/**
 * Builds a wire room.
 *
 * @param id Room id.
 * @param name Name.
 * @returns Room.
 */
function wire(id: string, name: string): Record<string, unknown> {
  return { id, name, owner: 'Henry', private: false, users: 1, maxUsers: 8, protocol: 2, editor: '' };
}

/** Client side of the live room list. */
describe('runtime_collaboration_rooms_watch', () => {
  it('starts from room.subscribed, applies room.list.update deltas and reports loss once', () => {
    const watch = new RuntimeCollaborationRoomsWatch();
    const seen: string[][] = [];
    const lost: string[] = [];
    const watcher = {
      update: (rooms: SessionCollaborationRoomInfo[]) => seen.push(rooms.map((each) => each.name)),
      lost: (error: Error) => lost.push(error.message),
    };
    watch.start(watcher, { t: 'room.subscribed', rooms: [wire('a', 'A'), wire('b', 'B')] });
    watch.apply({ t: 'room.list.update', rooms: [wire('c', 'C')], removed: ['a'] });
    expect(seen).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ]);
    watch.lose(new Error('gone'));
    watch.lose(new Error('again'));
    watch.apply({ t: 'room.list.update', rooms: [wire('d', 'D')], removed: [] });
    expect(lost).toEqual(['gone']);
    expect(watch.active()).toBe(false);
    expect(seen).toHaveLength(2);
  });

  it('parses the owner and defaults it for relays that leave it out', () => {
    expect(runtimeCollaborationRoomsParse([wire('a', 'A')])[0]!.owner).toBe('Henry');
    expect(
      runtimeCollaborationRoomsParse([{ id: 'a', name: 'A', private: false, users: 1, maxUsers: 8 }])[0]!.owner,
    ).toBe('');
    expect(runtimeCollaborationRoomsParse('nope')).toEqual([]);
  });
});
