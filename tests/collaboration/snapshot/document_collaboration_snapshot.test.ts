import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { snapshotCollaborationToDocument } from '@/collaboration/snapshot/document_collaboration_snapshot.js';
import { snapshotCollaborationText } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { PROJECT_AUTOSAVE_FORMAT, PROJECT_AUTOSAVE_UNTITLED } from '@/project/autosave/project_autosave_files.js';
import { projectHistoryDocumentParse } from '@/project/history/core/project_history_document.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';

/**
 * Captures a one-box room state.
 *
 * @param name Box name.
 * @param time Save time.
 * @returns File text.
 */
function boxRoomText(name: string, time: number): string {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const box = new ToolPrimitiveCreation(owner.world).createBox(1, 1, 1);
  box.name = name;
  box.position.set(1, 2, 3);
  owner.world.add(box);
  new TrackerCollaboration(owner, 1 << 22).commit();
  return snapshotCollaborationText('Castle Jam', time, owner.snapshotStates());
}

describe('snapshotCollaborationToDocument', () => {
  it('turns a saved room state into a level the editor can load', () => {
    const document = snapshotCollaborationToDocument(boxRoomText('Crate', 1234));
    expect(document).toMatchObject({
      format: PROJECT_AUTOSAVE_FORMAT,
      version: 1,
      scene: PROJECT_AUTOSAVE_UNTITLED,
      sourcePath: null,
      savedAt: 1234,
    });
    expect(document?.data.objects).toEqual([
      expect.objectContaining({
        name: 'Crate',
        type: 'mesh',
        geometryType: 'box',
        position: { x: 1, y: 2, z: 3 },
      }),
    ]);
  });

  it('rejects other files', () => {
    expect(snapshotCollaborationToDocument('{"format":"other","savedAt":1,"states":[]}')).toBeNull();
    expect(snapshotCollaborationToDocument('not json')).toBeNull();
  });
});

describe('projectHistoryDocumentParse', () => {
  it('reads a level save and a room save', async () => {
    const level = {
      format: PROJECT_AUTOSAVE_FORMAT,
      version: 1,
      scene: 'maps__start',
      sourcePath: 'maps/start.aiworld',
      savedAt: 10,
      objectCount: 1,
      data: { version: 1, objects: [{ name: 'Box' }] },
    };
    expect((await projectHistoryDocumentParse(JSON.stringify(level)))?.sourcePath).toBe('maps/start.aiworld');
    expect((await projectHistoryDocumentParse(boxRoomText('Crate', 20)))?.data.objects[0]?.name).toBe('Crate');
  });
});
