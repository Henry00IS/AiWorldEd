import type { ProjectHistoryEntry } from '@/project/history/core/project_history_entry.js';

/** Outcome of an action: a status line. */
export interface DialogProjectHistoryResult {
  message: string;
}

/** What the Level History dialog reads and does. */
export interface DialogProjectHistorySource {
  /**
   * Reads every save of the project.
   *
   * @returns Saves.
   */
  entries(): Promise<ProjectHistoryEntry[]>;
  /**
   * Loads the thumbnail of a save.
   *
   * @param entry Save.
   * @returns Object URL kept until release, or null without one.
   */
  thumbnail(entry: ProjectHistoryEntry): Promise<string | null>;
  /** Frees every thumbnail URL handed out. */
  release(): void;
  /**
   * Loads a save.
   *
   * @param entry Save.
   * @returns Outcome.
   */
  restore(entry: ProjectHistoryEntry): Promise<DialogProjectHistoryResult>;
  /**
   * Stars or unstars a save.
   *
   * @param entry Save.
   * @param starred Whether to star it.
   * @returns Outcome.
   */
  star(entry: ProjectHistoryEntry, starred: boolean): Promise<DialogProjectHistoryResult>;
  /**
   * Deletes a save.
   *
   * @param entry Save.
   * @returns Outcome.
   */
  remove(entry: ProjectHistoryEntry): Promise<DialogProjectHistoryResult>;
}
