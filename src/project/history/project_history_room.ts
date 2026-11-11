import type { ProjectHistoryStore } from '@/project/history/core/project_history_store.js';

/** The room this client owns, as the Level History sees it. */
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
   * Sets the room back to a saved state for everyone.
   *
   * @param id Save id.
   * @returns Resolves once done.
   */
  restore(id: string): Promise<void>;
}
