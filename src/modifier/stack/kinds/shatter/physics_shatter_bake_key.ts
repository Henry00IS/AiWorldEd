import { PhysicsShatterHasher } from './fracture/physics_shatter_hash.js';

/**
 * Parameter keys of the simulation settings a bake depends on. Changing one of
 * them makes stored rubble show as needing a new simulation. Add every new
 * simulation setting here, such as a solver iteration count.
 */
export const PHYSICS_SHATTER_SIM_PARAMETER_KEYS: string[] = [
  'strength',
  'radius',
  'duration',
  'directionX',
  'directionY',
  'directionZ',
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
    const value = parameters[key];
    hasher.text(`${key}=`);
    if (typeof value === 'number' && Number.isFinite(value)) hasher.number(value);
    else hasher.text(`${JSON.stringify(value ?? null)};`);
  }
  return hasher.digest();
}
