import type * as THREE from 'three';
import type { ProjectHistoryStore } from '@/project/history/store/project_history_store.js';
import type { ProjectHistoryNode } from '@/project/history/tree/project_history_tree.js';

/** A saved room state rebuilt as a detached world. */
export interface ProjectHistoryRoomWorld {
  world: THREE.Group;
  dispose(): void;
}

/** The room this client owns, as the Level History sees it. */
export interface ProjectHistoryRoom {
  /** Room name. */
  readonly name: string;
  /**
   * Returns the room's tree.
   *
   * @returns Tree store.
   */
  store(): Promise<ProjectHistoryStore>;
  /**
   * Tells whether the room changed since it was last saved.
   *
   * @returns True with unsaved changes.
   */
  pending(): boolean;
  /**
   * Keeps the room as it is now as a named snapshot.
   *
   * @param name Snapshot name.
   * @returns The snapshot, or null before the room synced.
   */
  snapshot(name: string): Promise<ProjectHistoryNode | null>;
  /**
   * Sets the room back to a saved state for everyone.
   *
   * @param id Node id.
   * @returns Resolves once done.
   */
  restore(id: string): Promise<void>;
  /**
   * Rebuilds a saved room state as a detached world.
   *
   * @param id Node id.
   * @returns World, or null when the state cannot be read.
   */
  world(id: string): Promise<ProjectHistoryRoomWorld | null>;
}
