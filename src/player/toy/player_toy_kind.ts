import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';

/** Kind name of the keyboard toy (placed on its stand, never thrown). */
export const PLAYER_TOY_KEYBOARD = 'keyboard';

/** A toy the player can pick: a thrown or put-down physics toy, or the keyboard. */
export type PlayerToyKind = PhysicsToyKind | typeof PLAYER_TOY_KEYBOARD;
