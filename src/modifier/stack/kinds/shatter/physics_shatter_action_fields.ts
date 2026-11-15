import type { ModifierStackActionTarget, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { PHYSICS_SHATTER_BAKE_KEY } from './physics_shatter_bake_state.js';
import { physicsShatterFormatIsFuture } from './physics_shatter_format_version.js';
import {
  PHYSICS_SHATTER_SIM_MATERIAL_CUSTOM,
  PHYSICS_SHATTER_SIM_MATERIAL_ROWS,
  type PhysicsShatterSimMaterial,
} from './sim/physics_shatter_sim_material.js';

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

/**
 * Returns whether the material is Custom, whose physics come from its rows.
 *
 * @param parameters Normalized parameters.
 * @returns True for Custom.
 */
function physicsShatterActionIsCustom(parameters: Record<string, unknown>): boolean {
  return parameters['material'] === 'custom';
}

/**
 * Builds one Custom physics row.
 *
 * @param name Material property.
 * @param label Row caption.
 * @param step Arrow-key step.
 * @param hint Tooltip.
 * @returns Field.
 */
function physicsShatterMaterialField(
  name: keyof PhysicsShatterSimMaterial,
  label: string,
  step: number,
  hint: string,
): ModifierStackField {
  const row = PHYSICS_SHATTER_SIM_MATERIAL_ROWS[name];
  const range = { min: row.min, max: row.max, step };
  const shown = { group: 'Simulation', hint, visible: physicsShatterActionIsCustom };
  return {
    key: row.key,
    label,
    type: 'number',
    default: PHYSICS_SHATTER_SIM_MATERIAL_CUSTOM[name],
    ...range,
    ...shown,
  };
}

/** Custom material physics rows, shown only when the material is Custom. */
const PHYSICS_SHATTER_MATERIAL_FIELDS: readonly ModifierStackField[] = [
  physicsShatterMaterialField(
    'density',
    'Density',
    50,
    'Weight in kg per cubic metre. Heavier pieces push lighter ones aside.',
  ),
  physicsShatterMaterialField(
    'friction',
    'Friction',
    0.05,
    'How much pieces grip once they land. Low slides far, high stops quickly.',
  ),
  physicsShatterMaterialField(
    'restitution',
    'Bounciness',
    0.01,
    'How much pieces bounce. Keep it low so piles settle.',
  ),
  physicsShatterMaterialField(
    'linearDamping',
    'Air Drag',
    0.05,
    'How fast flying pieces slow down. High puffs out and drops close.',
  ),
  physicsShatterMaterialField('angularDamping', 'Spin Drag', 0.05, 'How fast pieces stop spinning.'),
  physicsShatterMaterialField('blast', 'Blast Scale', 0.05, 'Multiplies how hard the blast throws the pieces.'),
  physicsShatterMaterialField('tumble', 'Tumble', 0.05, 'Multiplies how much pieces spin as they fly.'),
];

/** Solver setting, Simulate and Reset buttons of the Physics Shatter modifier. */
export const PHYSICS_SHATTER_ACTION_FIELDS: readonly ModifierStackField[] = [
  ...PHYSICS_SHATTER_MATERIAL_FIELDS,
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
