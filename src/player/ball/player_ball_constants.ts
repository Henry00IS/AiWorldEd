/** Balls one member may have at once; another throw removes their oldest. */
export const PLAYER_BALL_MAXIMUM_PER_MEMBER = 4;

/** Fall below the start height after which a ball is removed. */
export const PLAYER_BALL_KILL_DEPTH_METERS = 500;

/** Distance in front of the eye where a thrown ball starts. */
export const PLAYER_BALL_THROW_FORWARD_METERS = 0.45;

/** Horizontal distance in front of the player where a soccer ball is put down. */
export const PLAYER_BALL_PLACE_FORWARD_METERS = 1.1;

/** Height above the feet from which a put-down ball looks for the ground. */
export const PLAYER_BALL_PLACE_REACH_METERS = 0.6;

/**
 * Time between two snapshots of the thrower while a ball moves (5 per second,
 * the relay's toy rate).
 */
export const PLAYER_BALL_FRAME_INTERVAL_MS = 200;

/** Shortest time between a snapshot and the extra one sent right after a bounce. */
export const PLAYER_BALL_BOUNCE_GAP_MS = 30;

/** Snapshots per second the thrower may send on average (the relay allows 5). */
export const PLAYER_BALL_SEND_PER_SECOND = 5;

/** Snapshots the thrower may send in a burst (the relay allows 10). */
export const PLAYER_BALL_SEND_BURST = 8;

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
 * How far in the past other members' balls are drawn (snapshot interpolation):
 * one snapshot interval plus delivery jitter, like presence.
 */
export const PLAYER_BALL_RENDER_DELAY_MS = PLAYER_BALL_FRAME_INTERVAL_MS + 100;

/** Longest a remote ball is extrapolated when its snapshots run dry. */
export const PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS = 100;

/** Time constant by which a drawn ball blends back onto its snapshots. */
export const PLAYER_BALL_BLEND_MS = 100;

/** Drawn error beyond which a remote ball snaps instead of blending. */
export const PLAYER_BALL_SNAP_METERS = 2;

/**
 * Difference between a snapshot velocity and the average velocity to the next
 * snapshot beyond which the two are joined by a straight line (a bounce or a
 * push between them) instead of a Hermite curve.
 */
export const PLAYER_BALL_HERMITE_SLACK_METERS_PER_SECOND = 4;

/** Snapshots a receiver keeps per remote ball. */
export const PLAYER_BALL_SAMPLES_MAXIMUM = 8;

/** Range of the bounce counter on the wire (one nibble). */
export const PLAYER_BALL_BOUNCE_RANGE = 16;
/** Spawn counts per toy id before they wrap (one payload byte). */
export const PLAYER_BALL_SPAWN_RANGE = 256;
