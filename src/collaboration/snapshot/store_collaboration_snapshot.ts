import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { stateCollaborationParse } from '@/collaboration/sync/state_collaboration_parse.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import type { ProjectHistoryStore } from '@/project/history/store/project_history_store.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';

/** Format marker written into every saved room state. */
export const SNAPSHOT_COLLABORATION_FORMAT = 'aiworlded-room-snapshot';

/** Longest room name written into a saved room state. */
export const SNAPSHOT_COLLABORATION_ROOM_NAME_MAX = 80;

/**
 * Why the room is saved: the room started (a new session begins), the period
 * passed while the scene changed, or a large change is about to land (the
 * session ends after it, so the state before the change stays).
 */
export type SnapshotCollaborationReason = 'room-start' | 'periodic' | 'large-change';

/** Where the owner keeps the room's history right now. */
export interface SnapshotCollaborationHistory {
  /** The room's tree. */
  store: ProjectHistoryStore;
  /** Project folder whose texture cache keeps embedded textures, or null. */
  fileSystem: ProjectFileSystem | null;
  /** Library holding the embedded textures the states use. */
  library: TextureLibrary | null;
}

/**
 * Writes the text of a saved room state.
 *
 * @param room Room name.
 * @param savedAt Save time.
 * @param states Agreed node states.
 * @returns File text.
 */
export function snapshotCollaborationText(room: string, savedAt: number, states: NodeCollaborationState[]): string {
  return JSON.stringify({
    format: SNAPSHOT_COLLABORATION_FORMAT,
    version: 1,
    room: room.slice(0, SNAPSHOT_COLLABORATION_ROOM_NAME_MAX),
    savedAt,
    objectCount: states.length,
    states,
  });
}

/**
 * Parses a saved room state; states that fail validation are dropped.
 *
 * @param text File contents.
 * @returns Node states, or null when the text is not a saved room state.
 */
export function snapshotCollaborationParse(text: string): NodeCollaborationState[] | null {
  try {
    const value = JSON.parse(text) as { format?: unknown; states?: unknown } | null;
    if (value?.format !== SNAPSHOT_COLLABORATION_FORMAT || !Array.isArray(value.states)) return null;
    return (value.states as unknown[])
      .map((state) => stateCollaborationParse(state))
      .filter((state): state is NodeCollaborationState => state !== null);
  } catch {
    return null;
  }
}
