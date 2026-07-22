/**
 * Visual and interaction constants for clip plane placement markers.
 * Sized for a professional world-editor feel (small, readable, easy to grab).
 */

/** World-space radius of the solid marker core at unit scale. */
export const CLIP_MARKER_CORE_RADIUS = 0.022;

/** World-space radius of the dark halo behind the core at unit scale. */
export const CLIP_MARKER_HALO_RADIUS = 0.032;

/**
 * Multiplier from camera distance (perspective) or half-height (ortho)
 * to marker scale so markers stay roughly constant on screen.
 */
export const CLIP_MARKER_DISTANCE_SCALE = 0.026;

/** Minimum marker scale so points never become unusable when zoomed in. */
export const CLIP_MARKER_MIN_SCALE = 0.5;

/** Maximum marker scale so points never dominate the view when far away. */
export const CLIP_MARKER_MAX_SCALE = 4;

/** Screen-space pick radius in CSS pixels for grabbing a marker. */
export const CLIP_MARKER_PICK_PIXELS = 16;

/**
 * UserData key storing the placement point index on a marker group.
 */
export const CLIP_MARKER_INDEX_KEY = 'clipPlaneMarkerIndex';
