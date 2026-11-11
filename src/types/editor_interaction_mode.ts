/**
 * Top-level interaction mode (Object Mode vs Edit Mode). Distinct from
 * selection tools such as Face Select on the tool rail.
 */
export enum EditorInteractionMode {
  /** Select and transform whole objects. */
  OBJECT_MODE = 'object_mode',
  /** Component editing (vertices first); brushes stay convex. */
  EDIT_MODE = 'edit_mode',
}

/**
 * Returns the short display label for an interaction mode.
 *
 * @param mode Interaction mode.
 * @returns UI label.
 */
export function getEditorInteractionModeLabel(mode: EditorInteractionMode): string {
  if (mode === EditorInteractionMode.EDIT_MODE) {
    return 'Edit Mode';
  }
  return 'Object Mode';
}
