import type { ProjectHistoryStore } from '@/project/history/core/project_history_store.js';

/** The room this client is in, as the Level History sees it. */
export interface ProjectHistoryRoom {
  /** Room name. */
  readonly name: string;
  /**
   * Returns the store the room's saves go to.
   *
   * @returns Store.
   */
  store(): Promise<ProjectHistoryStore>;
  /**
   * Saves the room as a snapshot now (the level was saved by hand).
   *
   * @returns Resolves once written.
   */
  snapshot(): Promise<void>;
}
