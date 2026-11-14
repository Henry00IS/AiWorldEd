/**
 * Thrown ball radius in meters (twice a real tennis ball, easier to see and
 * hit).
 */
export const PHYSICS_BALL_RADIUS_METERS = 0.067;

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

/** Kind of a simulated toy. */
export type PhysicsToyKind = 'tennis' | 'soccer' | 'plane';

/** Size and contact behaviour of one toy kind. */
export interface PhysicsToyShape {
  /** Collision sphere radius. */
  readonly radius: number;
  /** Mass in kilograms (only ratios matter, in toy-toy contacts). */
  readonly mass: number;
  /** Share of normal speed kept after a bounce. */
  readonly restitution: number;
  /** Share of tangential speed kept after a bounce. */
  readonly bounceFriction: number;
  /** Normal speed into the ground below which it rolls or slides instead. */
  readonly rollNormalSpeed: number;
  /** Share of rolling speed lost per second. */
  readonly rollDamping: number;
}

/** Shapes of the toy kinds (a soccer ball is half again a size 5 ball). */
export const PHYSICS_TOY_SHAPES: Readonly<Record<PhysicsToyKind, PhysicsToyShape>> = {
  tennis: {
    radius: PHYSICS_BALL_RADIUS_METERS,
    mass: 0.058,
    restitution: PHYSICS_BALL_RESTITUTION,
    bounceFriction: PHYSICS_BALL_BOUNCE_FRICTION,
    rollNormalSpeed: PHYSICS_BALL_ROLL_NORMAL_SPEED_METERS_PER_SECOND,
    rollDamping: PHYSICS_BALL_ROLL_DAMPING_PER_SECOND,
  },
  soccer: {
    radius: 0.165,
    mass: 0.43,
    restitution: 0.65,
    bounceFriction: 0.85,
    rollNormalSpeed: 0.35,
    rollDamping: 0.35,
  },
  plane: { radius: 0.035, mass: 0.005, restitution: 0.2, bounceFriction: 0.6, rollNormalSpeed: 3, rollDamping: 0 },
};

/** Glide speed of the paper plane, where lift carries its weight. */
export const PHYSICS_PLANE_TRIM_SPEED_METERS_PER_SECOND = 4.5;

/** Lift over drag of the paper plane (its glide ratio). */
export const PHYSICS_PLANE_LIFT_TO_DRAG = 5;

/** Strongest lift of the paper plane, in multiples of gravity. */
export const PHYSICS_PLANE_LIFT_MAXIMUM_G = 2.5;

/** Friction coefficient of the paper plane skidding over a surface. */
export const PHYSICS_PLANE_SKID_FRICTION = 0.6;

/** Throw speed of the paper plane along the look direction. */
export const PHYSICS_PLANE_THROW_SPEED_METERS_PER_SECOND = 6;

/** Rate per second at which the nose follows the flight path (pitch stability). */
export const PHYSICS_PLANE_ALIGN_PER_SECOND = 10;

/** Bank in radians per radian per second of turning. */
export const PHYSICS_PLANE_BANK_PER_TURN_RATE = 0.25;

/** Steepest bank and pitch in radians. */
export const PHYSICS_PLANE_ATTITUDE_MAXIMUM_RADIANS = 1.5;
