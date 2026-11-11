import type {
  ProjectHistoryIndex,
  ProjectHistoryNode,
  ProjectHistoryTreeKind,
} from '@/project/history/tree/project_history_tree.js';

/** One tree as the dialog shows it. */
export interface DialogProjectHistoryTree {
  /** Unique id ("level/<key>" or "room/<key>"). */
  id: string;
  kind: ProjectHistoryTreeKind;
  /** Level path or room name. */
  label: string;
  /** Index as read when the dialog refreshed. */
  index: ProjectHistoryIndex;
  /** Whether the tree's work is live in the editor (open level, owned room). */
  current: boolean;
  /** Whether the live work changed since it was last saved. */
  pending: boolean;
}

/** Outcome of an action: a status line and the row to select afterwards. */
export interface DialogProjectHistoryResult {
  message: string;
  /** Row id to select, or undefined to keep the selection. */
  select?: string;
}

/** What the Level History dialog reads and does. */
export interface DialogProjectHistorySource {
  /**
   * Names the open project.
   *
   * @returns Project name, or empty without a project.
   */
  projectName(): string;
  /**
   * Reads the clock.
   *
   * @returns Current time in milliseconds.
   */
  now(): number;
  /**
   * Reads every tree: the open level's and the owned room's first.
   *
   * @returns Trees.
   */
  trees(): Promise<DialogProjectHistoryTree[]>;
  /**
   * Loads the thumbnail of a node.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Object URL kept until release, or null without one.
   */
  thumbnail(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<string | null>;
  /** Frees every thumbnail URL handed out. */
  release(): void;
  /**
   * Continues the work from a node.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Outcome.
   */
  restore(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<DialogProjectHistoryResult>;
  /**
   * Keeps the live work of a tree as a named snapshot.
   *
   * @param tree Current tree.
   * @param name Snapshot name.
   * @returns Outcome.
   */
  take(tree: DialogProjectHistoryTree, name: string): Promise<DialogProjectHistoryResult>;
  /**
   * Names a node; an empty name makes it an unnamed session again.
   *
   * @param tree Tree.
   * @param node Node.
   * @param name New name.
   * @returns Outcome.
   */
  rename(tree: DialogProjectHistoryTree, node: ProjectHistoryNode, name: string): Promise<DialogProjectHistoryResult>;
  /**
   * Sets the note of a node.
   *
   * @param tree Tree.
   * @param node Node.
   * @param note Note.
   * @returns Outcome.
   */
  note(tree: DialogProjectHistoryTree, node: ProjectHistoryNode, note: string): Promise<DialogProjectHistoryResult>;
  /**
   * Deletes a node; its children attach to its parent.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Outcome.
   */
  remove(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<DialogProjectHistoryResult>;
  /**
   * Writes a node out as a new level file.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Outcome.
   */
  copy(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): Promise<DialogProjectHistoryResult>;
}
