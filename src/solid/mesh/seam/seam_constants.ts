/**
 * Largest distance a corner of one output polygon may lie from another
 * polygon's edge and still be inserted into that edge, closing the crack a
 * T-junction would draw.
 */
export const SEAM_CORNER_ON_EDGE_DISTANCE = 0.001;

/** Edge length of one corner grid cell in solid model units. */
export const SEAM_CORNER_CELL_SIZE = 0.5;

/**
 * Smallest sine of the turn angle at a polygon vertex for it to count as a real
 * corner rather than a point along a straight edge.
 */
export const SEAM_CORNER_MINIMUM_TURN_SINE = 1e-7;

/**
 * Offset of the corner grid from the world origin. Editor geometry snaps to
 * round coordinates, so an odd offset keeps most corners away from cell
 * boundaries and filed in a single cell.
 */
export const SEAM_CORNER_CELL_ORIGIN = 0.1372583;

/**
 * Largest ratio between a corner's distance from an edge line and its distance
 * to the nearer edge end. A corner farther off than that is a separate feature
 * near a short edge, not a point of the edge, and inserting it would fold the
 * outline.
 */
export const SEAM_CORNER_MAXIMUM_SLOPE = 0.02;
