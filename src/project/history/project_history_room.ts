import type { ProjectHistoryStore } from '@/project/history/core/project_history_store.js';

/** The room this client is in, as the Level History sees it. */
export interface ProjectHistoryRoom {
  /** Room name. */
  readonly name: string;
  /** Whether this client owns the room, the only one that restores it. */
  readonly owner: boolean;
  /**
   * Returns the store the room's saves go to.
   *
   * @returns Store.
   */
  store(): Promise<ProjectHistoryStore>;
  /**
   * Sets the room back to a saved state for everyone.
   *
   * @param id Save id.
   * @returns Resolves once done.
   */
  restore(id: string): Promise<void>;
  /**
   * Saves the room as a snapshot now (the level was saved by hand).
   *
   * @returns Resolves once written.
   */
  snapshot(): Promise<void>;
}
