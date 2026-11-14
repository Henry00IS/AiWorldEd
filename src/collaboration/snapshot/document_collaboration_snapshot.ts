import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import {
  PROJECT_AUTOSAVE_FORMAT,
  PROJECT_AUTOSAVE_UNTITLED,
  type ProjectAutosaveDocument,
} from '@/project/autosave/project_autosave_files.js';
import { projectHistoryObjectCount } from '@/project/history/core/project_history_object_count.js';
import {
  SNAPSHOT_COLLABORATION_FORMAT,
  snapshotCollaborationParse,
} from '@/collaboration/snapshot/store_collaboration_snapshot.js';

/**
 * Turns a saved room state into a level document the editor can load outside a
 * room.
 *
 * @param text File contents.
 * @returns Document, or null when the text is not a saved room state.
 */
export function snapshotCollaborationToDocument(text: string): ProjectAutosaveDocument | null {
  let savedAt: number;
  try {
    const value = JSON.parse(text) as { format?: unknown; savedAt?: unknown } | null;
    if (value?.format !== SNAPSHOT_COLLABORATION_FORMAT || typeof value.savedAt !== 'number') return null;
    savedAt = value.savedAt;
  } catch {
    return null;
  }
  const states = snapshotCollaborationParse(text);
  if (states === null) return null;
  const world = new THREE.Group();
  const replica = new ReplicaCollaborationScene(world);
  try {
    replica.snapshotApply(states);
    const data = new SceneSerializer().serialize(world);
    return {
      format: PROJECT_AUTOSAVE_FORMAT,
      version: 1,
      scene: PROJECT_AUTOSAVE_UNTITLED,
      sourcePath: null,
      savedAt,
      objectCount: projectHistoryObjectCount(data),
      data,
    };
  } finally {
    replica.applier.clearScene();
  }
}
