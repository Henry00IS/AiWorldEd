/** Balls one member may have at once; another throw removes their oldest. */
export const PLAYER_BALL_MAXIMUM_PER_MEMBER = 4;

/** Fall below the start height after which a ball is removed. */
export const PLAYER_BALL_KILL_DEPTH_METERS = 500;

/** Distance in front of the eye where a thrown ball starts. */
export const PLAYER_BALL_THROW_FORWARD_METERS = 0.45;

/** Shortest time between two snapshots of the thrower (at most 5 per second). */
export const PLAYER_BALL_FRAME_INTERVAL_MS = 200;

/**
 * Time without a snapshot after which moving balls are sent again (2 per
 * second).
 */
export const PLAYER_BALL_KEEPALIVE_MS = 500;

/** Time between two snapshots listing every ball while any ball moves. */
export const PLAYER_BALL_FULL_INTERVAL_MS = 2000;

/** Steps per second by which the estimated thrower clock offset may grow. */
export const PLAYER_BALL_CLOCK_DRIFT_STEPS_PER_SECOND = 1;

/**
 * Fastest horizontal player speed balls are pushed with (a little above
 * running).
 */
export const PLAYER_BALL_MOVER_SPEED_MAXIMUM_METERS_PER_SECOND = 14;

/** Fastest vertical player speed balls are pushed with. */
export const PLAYER_BALL_MOVER_VERTICAL_MAXIMUM_METERS_PER_SECOND = 20;

/** Ball color when there is no room color. */
export const PLAYER_BALL_OFFLINE_COLOR = 0xd4f53c;

/** User data flag of ball meshes (editor helpers, never picked or saved). */
export const PLAYER_BALL_USERDATA_KEY = 'isPlayerBall';

/**
 * How far in the past other members' balls are drawn, so the next snapshot has
 * usually arrived before it is needed (covers the 200 ms send interval and
 * typical delivery).
 */
export const PLAYER_BALL_RENDER_DELAY_MS = 250;

/** Longest a remote ball is extrapolated past its newest snapshot. */
export const PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS = 500;

/** Snapshots a receiver keeps per remote ball. */
export const PLAYER_BALL_SAMPLES_MAXIMUM = 8;

/** Range of the bounce counter on the wire (one nibble). */
export const PLAYER_BALL_BOUNCE_RANGE = 16;
