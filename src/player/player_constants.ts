/** Capsule height in world meters for the play-mode character collider. */
export const PLAYER_COLLIDER_HEIGHT_METERS = 1.75;

/** Eye height above the feet used for the first-person camera. */
export const PLAYER_EYE_HEIGHT_METERS = 1.65;

/** Capsule radius in world meters. */
export const PLAYER_COLLIDER_RADIUS_METERS = 0.35;

/** Walking speed in meters per second (Half-Life 2-like walk). */
export const PLAYER_WALK_SPEED_METERS_PER_SECOND = 4.5;

/** Running speed in meters per second while Shift is held. */
export const PLAYER_RUN_SPEED_METERS_PER_SECOND = 10.5;

/**
 * Simulation time scale while Control is held in play mode. Scales movement and
 * animation together so gait and locomotion can be inspected in slow motion.
 */
export const PLAYER_SLOW_MOTION_TIME_SCALE = 0.12;

/**
 * Grounded acceleration while steering (HL2-like: snappy ramp, shared by first-
 * and third-person).
 */
export const PLAYER_GROUND_ACCELERATION_METERS_PER_SECOND_SQUARED = 95;

/** Grounded horizontal deceleration when releasing move input (brief stop). */
export const PLAYER_GROUND_DECELERATION_METERS_PER_SECOND_SQUARED = 72;

/** Airborne acceleration while steering (limited air control). */
export const PLAYER_AIR_ACCELERATION_METERS_PER_SECOND_SQUARED = 55;

/** Airborne horizontal deceleration when releasing move input. */
export const PLAYER_AIR_DECELERATION_METERS_PER_SECOND_SQUARED = 8;

/** How quickly body facing turns toward move or wall direction (radians/sec). */
export const PLAYER_FACING_TURN_RATE_RADIANS_PER_SECOND = 10;

/** Upward jump impulse in meters per second (roomy HL2-style hop). */
export const PLAYER_JUMP_SPEED_METERS_PER_SECOND = 7.2;

/** Gravity acceleration magnitude in meters per second squared. */
export const PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED = 16;

/** Coyote time in seconds after leaving a floor during which jump still works. */
export const PLAYER_COYOTE_TIME_SECONDS = 0.12;

/** Mouse look sensitivity in radians per pixel. */
export const PLAYER_MOUSE_SENSITIVITY = 0.0022;

/** Default third-person orbit distance in meters. */
export const PLAYER_THIRD_PERSON_DISTANCE_DEFAULT = 3.5;

/** Minimum third-person orbit distance in meters. */
export const PLAYER_THIRD_PERSON_DISTANCE_MIN = 1.2;

/** Maximum third-person orbit distance in meters. */
export const PLAYER_THIRD_PERSON_DISTANCE_MAX = 12;

/** Skin offset used when resolving camera wall collisions. */
export const PLAYER_CAMERA_WALL_SKIN_METERS = 0.15;

/** Skin offset above floor surfaces for the third-person camera. */
export const PLAYER_CAMERA_FLOOR_SKIN_METERS = 0.12;

/** Step height the capsule may climb without jumping. */
export const PLAYER_STEP_HEIGHT_METERS = 0.35;

/**
 * Minimum planar depth of a tread for the extended step probe. Lets the capsule
 * step lips smaller than its radius.
 */
export const PLAYER_STEP_MIN_REQUIRED_DEPTH_METERS = 0.1;

/**
 * Maximum walkable surface slope in degrees. Steeper contacts are walls or
 * ceilings for the character solver.
 */
export const PLAYER_MAX_WALKABLE_SLOPE_DEGREES = 60;

/** Cosine of the max walkable slope (precomputed for contact classification). */
export const PLAYER_MIN_WALKABLE_NORMAL_Y = Math.cos((PLAYER_MAX_WALKABLE_SLOPE_DEGREES * Math.PI) / 180);

/** Horizontal collision skin offset in meters. */
export const PLAYER_WALL_SKIN_METERS = 0.02;

/**
 * Minimum wall height above the feet required before wall-push hands engage.
 * Shorter barriers still block the capsule but do not plant palms on empty
 * air.
 */
export const PLAYER_WALL_HAND_MIN_HEIGHT_METERS = 1.4;

/** Extra radius added when generating capsule contacts (skin). */
export const PLAYER_CONTACT_SKIN_METERS = 0.02;

/** Maximum pitch magnitude in radians for look. */
export const PLAYER_PITCH_LIMIT_RADIANS = Math.PI / 2 - 0.02;

/** UserData key marking player figurine helper objects. */
export const PLAYER_FIGURINE_USERDATA_KEY = 'isPlayerFigurine';

/** Target visual height for the loaded play-mode character mesh. */
export const PLAYER_CHARACTER_TARGET_HEIGHT_METERS = 1.75;

/** Gap the Rapier character controller keeps between the capsule and geometry. */
export const PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS = 0.01;

/** Distance the character controller snaps down onto ground while walking. */
export const PLAYER_CHARACTER_SNAP_TO_GROUND_METERS = 0.4;

/** Downward push applied every grounded frame so ground contact is re-detected. */
export const PLAYER_GROUND_STICK_METERS = 0.01;

/** Maximum depenetration passes before falling back to an escape search. */
export const PLAYER_DEPENETRATION_MAX_PASSES = 6;

/** Vertical spacing between candidate poses when escaping out of geometry. */
export const PLAYER_ESCAPE_SEARCH_STEP_METERS = 0.25;

/** Highest lift tried when escaping out of geometry that appeared on the player. */
export const PLAYER_ESCAPE_SEARCH_MAX_LIFT_METERS = 24;

/** Ring radii tried (up and sideways) before the long upward lift search. */
export const PLAYER_ESCAPE_SEARCH_RADII_METERS: readonly number[] = [0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2];

/** Minimum upward speed treated as a jump that disables ground snapping. */
export const PLAYER_JUMP_SNAP_SUPPRESSION_SPEED_METERS_PER_SECOND = 0.5;

/** Radius of the sphere swept from the head to place the third-person camera. */
export const PLAYER_CAMERA_COLLISION_RADIUS_METERS = 0.2;

/** Closest the third-person camera may be pulled toward the head. */
export const PLAYER_CAMERA_COLLISION_MIN_DISTANCE_METERS = 0.1;

/** Rate (per second) at which the third-person camera eases back out. */
export const PLAYER_CAMERA_EASE_OUT_RATE_PER_SECOND = 6;

/** Minimum hit normal Y treated as floor the third-person camera slides over. */
export const PLAYER_CAMERA_FLOOR_NORMAL_Y_MIN = 0.7;
