/**
 * Coordinate space for translate / rotate / scale gizmo handles.
 */
export enum TransformSpace {
  /** Handles align to world axes (default). */
  Global = 'global',
  /** Handles align to the selected object's local axes (single selection). */
  Local = 'local'
}

/**
 * Returns a short UI label for a transform space mode.
 * @param space Transform space value.
 * @returns Display label.
 */
export function transformSpaceLabel(space: TransformSpace): string {
  if (space === TransformSpace.Local) return 'Local';
  return 'Global';
}
