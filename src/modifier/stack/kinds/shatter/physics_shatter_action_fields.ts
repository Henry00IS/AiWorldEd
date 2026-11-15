import type { ModifierStackActionTarget, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { PHYSICS_SHATTER_BAKE_KEY } from './physics_shatter_bake_state.js';
import { physicsShatterFormatIsFuture } from './physics_shatter_format_version.js';

/** Parameter key of the solver iteration count. */
export const PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY = 'solverIterations';

/** Solver iterations per step unless the modifier says otherwise. */
export const PHYSICS_SHATTER_SOLVER_ITERATIONS_DEFAULT = 8;

/** Most solver iterations per step. */
export const PHYSICS_SHATTER_SOLVER_ITERATIONS_MAX = 16;

/**
 * Loads the simulation code on first use and plays the blast.
 *
 * @param target Action target.
 */
async function physicsShatterActionSimulate(target: ModifierStackActionTarget): Promise<void> {
  const { physicsShatterSimulateAction } = await import('./sim/physics_shatter_simulate.js');
  await physicsShatterSimulateAction(target);
}

/**
 * Loads the simulation code on first use and clears the stored rubble.
 *
 * @param target Action target.
 */
async function physicsShatterActionReset(target: ModifierStackActionTarget): Promise<void> {
  const { physicsShatterResetAction } = await import('./sim/physics_shatter_simulate.js');
  physicsShatterResetAction(target);
}

/**
 * Returns whether rubble is stored.
 *
 * @param parameters Normalized parameters.
 * @returns True when a bake is stored.
 */
function physicsShatterActionHasBake(parameters: Record<string, unknown>): boolean {
  const bake = parameters[PHYSICS_SHATTER_BAKE_KEY];
  return typeof bake === 'string' && bake.length > 0;
}

/** Solver setting, Simulate and Reset buttons of the Physics Shatter modifier. */
export const PHYSICS_SHATTER_ACTION_FIELDS: readonly ModifierStackField[] = [
  {
    key: PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY,
    label: 'Solver Iterations',
    type: 'number',
    default: PHYSICS_SHATTER_SOLVER_ITERATIONS_DEFAULT,
    min: 1,
    max: PHYSICS_SHATTER_SOLVER_ITERATIONS_MAX,
    integer: true,
    step: 1,
    group: 'Simulation',
    hint: 'Physics passes per step. Higher stops pieces sinking into each other but simulates slower.',
  },
  {
    key: 'simulate',
    label: 'Simulate',
    type: 'action',
    default: '',
    group: 'Simulation',
    hint: 'Plays the blast and saves where the pieces land, for everyone in the room.',
    action: physicsShatterActionSimulate,
    actionDisabled: physicsShatterFormatIsFuture,
  },
  {
    key: 'resetBake',
    label: 'Reset',
    type: 'action',
    default: '',
    group: 'Simulation',
    hint: 'Clears the saved result so the pieces show unbroken again.',
    action: physicsShatterActionReset,
    visible: physicsShatterActionHasBake,
  },
];
