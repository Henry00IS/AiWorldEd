import { describe, expect, it } from 'vitest';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  SNAPSHOT_COLLABORATION_FORMAT,
  SNAPSHOT_COLLABORATION_ROOM_NAME_MAX,
  snapshotCollaborationParse,
  snapshotCollaborationText,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';

const STATE: NodeCollaborationState = { id: 'n1', kind: 'entry', parent: '', key: 'a', data: { entry: {} } as never };

describe('saved room states', () => {
  it('writes the room, time, object count and states, and reads the states back', () => {
    const text = snapshotCollaborationText('Castle Jam', 1234, [STATE]);
    expect(JSON.parse(text)).toMatchObject({
      format: SNAPSHOT_COLLABORATION_FORMAT,
      room: 'Castle Jam',
      savedAt: 1234,
      objectCount: 1,
    });
    expect(snapshotCollaborationParse(text)).toEqual([STATE]);
  });

  it('cuts long room names', () => {
    const text = snapshotCollaborationText('x'.repeat(200), 0, []);
    expect(JSON.parse(text).room).toHaveLength(SNAPSHOT_COLLABORATION_ROOM_NAME_MAX);
  });

  it('drops invalid states and rejects other files', () => {
    const text = JSON.stringify({ format: SNAPSHOT_COLLABORATION_FORMAT, states: [STATE, { id: '../bad' }] });
    expect(snapshotCollaborationParse(text)).toEqual([STATE]);
    expect(snapshotCollaborationParse('{"format":"other","states":[]}')).toBeNull();
    expect(snapshotCollaborationParse('not json')).toBeNull();
  });
});
