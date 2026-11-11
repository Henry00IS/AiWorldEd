/**
 * Edit Mode component selection target (vertex / edge / face). Only meaningful
 * while {@link EditorInteractionMode.EDIT_MODE} is active.
 */
export enum EditorComponentMode {
  /** Select mesh or brush vertices. */
  VERTEX = 'vertex',
  /** Select undirected edges. */
  EDGE = 'edge',
  /** Select faces (document faces or authored brush surfaces). */
  FACE = 'face',
}

/**
 * Returns the short UI label for a component mode.
 *
 * @param mode Component mode.
 * @returns Display label.
 */
export function getEditorComponentModeLabel(mode: EditorComponentMode): string {
  if (mode === EditorComponentMode.EDGE) {
    return 'Edge';
  }
  if (mode === EditorComponentMode.FACE) {
    return 'Face';
  }
  return 'Vertex';
}

/**
 * Returns the default keyboard digit for a component mode (Edit Mode only).
 *
 * @param mode Component mode.
 * @returns Digit character without modifiers.
 */
export function getEditorComponentModeDigit(mode: EditorComponentMode): string {
  if (mode === EditorComponentMode.EDGE) {
    return '2';
  }
  if (mode === EditorComponentMode.FACE) {
    return '3';
  }
  return '1';
}
