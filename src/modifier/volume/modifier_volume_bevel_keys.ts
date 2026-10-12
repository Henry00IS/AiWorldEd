/** UserData flag marking a bevel volume object. */
export const MODIFIER_VOLUME_BEVEL_USERDATA_KEY = 'isModifierVolume';

/** UserData number storing the chamfer distance in world units. */
export const MODIFIER_VOLUME_BEVEL_DISTANCE_KEY = 'modifierBevelDistance';

/** UserData integer storing how many faces approximate the round profile. */
export const MODIFIER_VOLUME_BEVEL_SEGMENTS_KEY = 'modifierBevelSegments';

/** UserData number storing the sharpness limit in degrees. */
export const MODIFIER_VOLUME_BEVEL_ANGLE_KEY = 'modifierBevelAngleDegrees';

/** UserData flag marking the volume's outline, hidden from the outliner. */
export const MODIFIER_VOLUME_BEVEL_EDGE_KEY = 'isModifierVolumeEdge';

/** Default world-space chamfer distance for a new bevel volume. */
export const MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE = 0.05;

/** One face: a flat chamfer. Higher counts follow a circular profile. */
export const MODIFIER_VOLUME_BEVEL_DEFAULT_SEGMENTS = 1;

/** Sharpest corner that still stays square, in degrees. Matches a 30° limit. */
export const MODIFIER_VOLUME_BEVEL_DEFAULT_ANGLE_DEGREES = 30;

/** Upper bound so one volume cannot emit an unbounded clip count. */
export const MODIFIER_VOLUME_BEVEL_MAX_SEGMENTS = 32;
