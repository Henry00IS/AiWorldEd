/** Longest reach of the beam from the eye. */
export const PLAYER_GRAPPLE_RANGE_METERS = 90;

/** Shortest time between letting go and hooking again. */
export const PLAYER_GRAPPLE_COOLDOWN_SECONDS = 0.06;

/**
 * Gap the pull keeps between the capsule and the hooked surface before the rope
 * slack (keeps the camera off it, so it never sees through).
 */
export const PLAYER_GRAPPLE_CLEARANCE_METERS = 0.15;

/**
 * How much higher the pull aims over a floor or ledge top (the feet clear its
 * edge).
 */
export const PLAYER_GRAPPLE_LEDGE_LIFT_METERS = 0.2;

/**
 * Rope slack at the end of the pull: within this distance of the target the
 * beam lets the body hang like on a rope instead of pulling it in.
 */
export const PLAYER_GRAPPLE_SLACK_METERS = 0.25;

/**
 * Stiffness of the rope beyond the slack (acceleration per meter of stretch):
 * the body hangs about gravity / stiffness past the slack.
 */
export const PLAYER_GRAPPLE_ROPE_STIFFNESS_PER_SECOND_SQUARED = 240;

/** Speed left for swinging on the rope once braked at the slack. */
export const PLAYER_GRAPPLE_ROPE_SWING_SPEED_METERS_PER_SECOND = 2;

/**
 * Highest a ledge top may be above a wall hook for the pull to aim up onto it
 * (hooking just below the rim of a pit or the top of a wall climbs onto it).
 */
export const PLAYER_GRAPPLE_LEDGE_REACH_METERS = 1.5;

/**
 * How far behind the wall face the pull lands on a ledge (past the capsule
 * radius).
 */
export const PLAYER_GRAPPLE_LEDGE_INSET_METERS = 0.6;

/** Pull acceleration toward the anchor at any distance. */
export const PLAYER_GRAPPLE_PULL_METERS_PER_SECOND_SQUARED = 44;

/** Extra pull per meter of beam length (a far hook yanks harder, like a spring). */
export const PLAYER_GRAPPLE_PULL_PER_METER = 0.6;

/** Beam length beyond which the pull grows no further. */
export const PLAYER_GRAPPLE_PULL_LENGTH_CAP_METERS = 40;

/** Extra acceleration along the look direction while pulling (steers the arc). */
export const PLAYER_GRAPPLE_AIM_METERS_PER_SECOND_SQUARED = 10;

/**
 * Damping rate (per second) of the velocity across the beam only: the body
 * swings and arcs but does not orbit the anchor forever.
 */
export const PLAYER_GRAPPLE_SWING_DAMPING_PER_SECOND = 1.6;

/** Fastest speed the pull reaches (letting go never clamps). */
export const PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND = 32;

/** Speed kick toward the anchor when the beam hooks. */
export const PLAYER_GRAPPLE_YANK_METERS_PER_SECOND = 8;

/**
 * Share of the speed away from the anchor that is kept when the beam hooks: a
 * new hook yanks the body round toward it instead of letting it fly on away.
 */
export const PLAYER_GRAPPLE_YANK_AWAY_KEPT = 0.4;

/** Smallest upward speed right after hooking from the ground (always lifts off). */
export const PLAYER_GRAPPLE_YANK_LIFT_METERS_PER_SECOND = 4.5;

/**
 * Stretch past the slack inside which the aim stops steering and the motion is
 * damped toward hanging still.
 */
export const PLAYER_GRAPPLE_ARRIVE_METERS = 2.5;

/**
 * Hardest braking of the speed on arrival: the body zips in and the rope
 * catches it instead of it overshooting and bouncing back.
 */
export const PLAYER_GRAPPLE_BRAKE_METERS_PER_SECOND_SQUARED = 120;

/** Damping rate (per second) of the motion while hanging on the rope. */
export const PLAYER_GRAPPLE_HANG_DAMPING_PER_SECOND = 6;

/**
 * Drag rate (per second) of airborne speed above the run speed: after letting
 * go the body flies on with its momentum, slowing only a little.
 */
export const PLAYER_GRAPPLE_FLIGHT_DRAG_PER_SECOND = 0.15;

/**
 * Damping rate (per second) of the horizontal speed while pulled along a wall:
 * the pull drags the body up the wall instead of swinging it along it.
 */
export const PLAYER_GRAPPLE_WALL_FRICTION_PER_SECOND = 6;

/** Field of view added at full flight speed. */
export const PLAYER_GRAPPLE_FOV_KICK_DEGREES = 12;

/** Speed where the field of view starts to widen. */
export const PLAYER_GRAPPLE_FOV_SPEED_START = 14;

/** Rate (per second) at which the field of view follows the speed. */
export const PLAYER_GRAPPLE_FOV_RATE_PER_SECOND = 6;

/** Beam core radius. */
export const PLAYER_GRAPPLE_BEAM_RADIUS_METERS = 0.025;

/** Beam glow radius. */
export const PLAYER_GRAPPLE_GLOW_RADIUS_METERS = 0.09;

/** Beam radius at the hand relative to the anchor end (thin up close). */
export const PLAYER_GRAPPLE_BEAM_HAND_TAPER = 0.3;

/** Beam glow color (the core is white). */
export const PLAYER_GRAPPLE_BEAM_COLOR = 0x42d9ff;

/** Seconds the impact flash at the anchor lasts. */
export const PLAYER_GRAPPLE_FLASH_SECONDS = 0.22;

/** Radius the impact flash grows to. */
export const PLAYER_GRAPPLE_FLASH_RADIUS_METERS = 0.6;

/** Seconds a missed shot's beam flickers out. */
export const PLAYER_GRAPPLE_FIZZLE_SECONDS = 0.16;

/** Length of a missed shot's beam. */
export const PLAYER_GRAPPLE_FIZZLE_METERS = 14;

/** First-person beam start in camera space (right, down, ahead of the eye). */
export const PLAYER_GRAPPLE_HAND_OFFSET: readonly [number, number, number] = [0.26, -0.24, -0.8];

/** Height above the feet where the beam leaves a character's hand. */
export const PLAYER_GRAPPLE_HAND_HEIGHT_METERS = 1.2;

/** Sideways offset (to the character's right) where the beam leaves the hand. */
export const PLAYER_GRAPPLE_HAND_SIDE_METERS = 0.28;

/** Loudness of the own grapple sounds (a fifth of the first version's 0.45). */
export const PLAYER_GRAPPLE_VOLUME = 0.09;

/** Loudness of other players' grapple sounds (quieter than the own). */
export const PLAYER_GRAPPLE_REMOTE_VOLUME = 0.06;

/** Distance from the player within which the grapple sounds play at full level. */
export const PLAYER_GRAPPLE_FALLOFF_FULL_METERS = 4;

/** Distance from the player where the grapple sounds fall silent (linear in between). */
export const PLAYER_GRAPPLE_FALLOFF_SILENT_METERS = 20;

/** Hum frequency at rest. */
export const PLAYER_GRAPPLE_HUM_HERTZ = 55;

/** Hum frequency rise per meter per second of speed. */
export const PLAYER_GRAPPLE_HUM_HERTZ_PER_SPEED = 2.2;
