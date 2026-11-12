/** Tennis ball radius in meters. */
export const PHYSICS_BALL_RADIUS_METERS = 0.0335;

/** Fixed simulation step; every client advances balls in these steps. */
export const PHYSICS_BALL_STEP_SECONDS = 1 / 120;

/** Downward acceleration applied to balls. */
export const PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;

/** Share of normal speed kept after a bounce. */
export const PHYSICS_BALL_RESTITUTION = 0.72;

/** Share of tangential speed kept after a bounce. */
export const PHYSICS_BALL_BOUNCE_FRICTION = 0.85;

/** Normal speed below which a contact stops bouncing and the ball rolls. */
export const PHYSICS_BALL_ROLL_NORMAL_SPEED_METERS_PER_SECOND = 0.35;

/** Share of rolling speed lost per second. */
export const PHYSICS_BALL_ROLL_DAMPING_PER_SECOND = 0.6;

/** Speed below which a ball resting on walkable ground stops for good. */
export const PHYSICS_BALL_REST_SPEED_METERS_PER_SECOND = 0.05;

/** Contacts resolved inside one step before the rest of the move is dropped. */
export const PHYSICS_BALL_MAX_CONTACTS_PER_STEP = 4;

/** Gap kept between the ball and a surface after a contact. */
export const PHYSICS_BALL_CONTACT_SKIN_METERS = 0.0005;

/** Surface normal Y above which a contact counts as ground. */
export const PHYSICS_BALL_GROUND_NORMAL_Y = 0.7;

/** Smallest speed into a surface that counts as an audible impact. */
export const PHYSICS_BALL_IMPACT_SPEED_METERS_PER_SECOND = 0.8;

/** Most simulation steps one frame may run before the rest is dropped. */
export const PHYSICS_BALL_MAX_STEPS_PER_FRAME = 24;

/** Throw speed along the look direction. */
export const PHYSICS_BALL_THROW_SPEED_METERS_PER_SECOND = 14;

/** Extra upward throw speed so a level throw arcs. */
export const PHYSICS_BALL_THROW_LIFT_METERS_PER_SECOND = 2;

/** Share of the closing speed kept when two balls hit each other. */
export const PHYSICS_BALL_PAIR_RESTITUTION = 0.8;

/** Share of the closing speed kept when a ball hits a player. */
export const PHYSICS_BALL_MOVER_RESTITUTION = 0.5;

/** Overlap below which touching balls are left alone (no push, no wake). */
export const PHYSICS_BALL_OVERLAP_SLOP_METERS = 0.001;
