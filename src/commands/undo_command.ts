/**
 * Base interface for all undoable commands.
 * Every command must implement execute and undo methods.
 * Optional dispose releases resources when the command is permanently dropped
 * (redo cleared, stack cleared, or stack disposed) — never call dispose while
 * the command's effect is still live in the scene.
 */
export interface UndoCommand {
  /**
   * Executes the command, applying its effect to the scene.
   */
  execute(): void;

  /**
   * Undoes the command, reverting its effect on the scene.
   */
  undo(): void;

  /**
   * Optionally releases resources held by a permanently discarded command.
   */
  dispose?(): void;
}
