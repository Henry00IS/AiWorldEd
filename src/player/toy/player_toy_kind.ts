import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';

/** Kind name of the keyboard toy (placed on its stand, never thrown). */
export const PLAYER_TOY_KEYBOARD = 'keyboard';

/** Kind name of the grapple beam (fired, never thrown). */
export const PLAYER_TOY_GRAPPLE = 'grapple';

/**
 * A toy the player can pick: a thrown or put-down physics toy, the keyboard or
 * the grapple beam.
 */
export type PlayerToyKind = PhysicsToyKind | typeof PLAYER_TOY_KEYBOARD | typeof PLAYER_TOY_GRAPPLE;
