import { PhysicsShatterHasher } from './fracture/physics_shatter_hash.js';
import {
  PHYSICS_SHATTER_SOLVER_ITERATIONS_DEFAULT,
  PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY,
  PHYSICS_SHATTER_SOLVER_ITERATIONS_MAX,
} from './physics_shatter_action_fields.js';

/**
 * Parameter keys of the simulation settings a bake depends on. Changing one of
 * them makes stored rubble show as needing a new simulation. Add every new
 * simulation setting here.
 */
export const PHYSICS_SHATTER_SIM_PARAMETER_KEYS: string[] = [
  'strength',
  'radius',
  'duration',
  'directionX',
  'directionY',
  'directionZ',
  PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY,
];

/**
 * Builds the key a bake is stored under: the fracture input hash plus the
 * simulation settings. Simulate writes it as `bakeHash`; the stale check
 * compares it with the current one.
 *
 * @param inputHash Fracture input hash of the pieces.
 * @param parameters Normalized modifier parameters.
 * @returns Sixteen hexadecimal characters.
 */
export function physicsShatterBakeKey(inputHash: string, parameters: Record<string, unknown>): string {
  const hasher = new PhysicsShatterHasher();
  hasher.text(`${inputHash}|`);
  for (const key of PHYSICS_SHATTER_SIM_PARAMETER_KEYS) {
    const value = physicsShatterBakeKeyValue(key, parameters[key]);
    hasher.text(`${key}=`);
    if (typeof value === 'number' && Number.isFinite(value)) hasher.number(value);
    else hasher.text(`${JSON.stringify(value ?? null)};`);
  }
  return hasher.digest();
}

/**
 * Returns the value a simulation setting is hashed as: the value Simulate uses,
 * so a missing solver iteration count hashes like the default.
 *
 * @param key Parameter key.
 * @param value Stored value.
 * @returns Value to hash.
 */
function physicsShatterBakeKeyValue(key: string, value: unknown): unknown {
  if (key !== PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY) return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return PHYSICS_SHATTER_SOLVER_ITERATIONS_DEFAULT;
  return Math.min(PHYSICS_SHATTER_SOLVER_ITERATIONS_MAX, Math.max(1, Math.round(value)));
}
