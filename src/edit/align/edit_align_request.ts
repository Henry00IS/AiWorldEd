/** Working grid axis an Edit Mode alignment flattens along. */
export type EditAlignAxis = 'x' | 'y' | 'z';

/** Where flattened vertices land on the extent of the selection along an axis. */
export type EditAlignAnchor = 'min' | 'center' | 'max';

/** Moves every selected vertex onto the nearest working grid point. */
export interface EditAlignRequestGrid {
  kind: 'grid';
}

/** Flattens every selected vertex onto one plane across a working grid axis. */
export interface EditAlignRequestAxis {
  kind: 'axis';
  axis: EditAlignAxis;
  anchor: EditAlignAnchor;
}

/** One Edit Mode alignment of the selected vertices. */
export type EditAlignRequest = EditAlignRequestGrid | EditAlignRequestAxis;
