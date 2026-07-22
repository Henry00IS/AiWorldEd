/**
 * Default grid snap interval in world units.
 * Matches the 0.25 entry in SNAP_PRESETS for a sensible start size.
 */
export const DEFAULT_GRID_SNAP_INTERVAL = 0.25;

/**
 * Maximum number of undo commands retained by the editor command stack.
 */
export const DEFAULT_COMMAND_STACK_MAX_SIZE = 64;

/**
 * Default orthographic frustum half-height for 2D viewports at startup.
 * Frames the unit default cube with comfortable padding for editing.
 */
export const DEFAULT_ORTHO_HALF_EXTENT = 1.5;

/**
 * Default perspective camera offset along each axis from the origin.
 * Places the 3D camera on the (1,1,1) diagonal close enough to the unit cube.
 */
export const DEFAULT_PERSPECTIVE_CAMERA_OFFSET = 2;

/**
 * World Y of the default unit cube center (box sits on the ground plane).
 * Front/side cameras and the 3D look-at target use this so the cube is centered.
 */
export const DEFAULT_CUBE_CENTER_Y = 0.5;
