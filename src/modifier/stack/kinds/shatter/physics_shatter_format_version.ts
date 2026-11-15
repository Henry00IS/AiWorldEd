import { PHYSICS_SHATTER_BAKE_HASH_KEY, PHYSICS_SHATTER_BAKE_KEY } from './physics_shatter_bake_state.js';

/** Parameter key of the saved data format version (hidden integer). */
export const PHYSICS_SHATTER_FORMAT_VERSION_KEY = 'formatVersion';

/**
 * Data format version this editor writes. Bump it when stored parameters change
 * meaning.
 */
export const PHYSICS_SHATTER_FORMAT_VERSION = 1;

/** Version assumed for saves without a format version. */
export const PHYSICS_SHATTER_FORMAT_VERSION_LEGACY = 1;

/** Feedback for a volume saved by a newer editor. */
export const PHYSICS_SHATTER_FORMAT_FUTURE =
  'Saved by a newer version of Physics Shatter: pieces show unbroken until this editor is updated.';

/**
 * Returns the stored format version, or the legacy version when it is missing
 * or not a positive integer.
 *
 * @param parameters Stored parameters.
 * @returns Format version.
 */
export function physicsShatterFormatVersionOf(parameters: Record<string, unknown>): number {
  const version = parameters[PHYSICS_SHATTER_FORMAT_VERSION_KEY];
  return typeof version === 'number' && Number.isInteger(version) && version >= 1
    ? version
    : PHYSICS_SHATTER_FORMAT_VERSION_LEGACY;
}

/**
 * Returns whether parameters were saved by a newer editor than this one.
 *
 * @param parameters Stored or normalized parameters.
 * @returns True for an unknown future format.
 */
export function physicsShatterFormatIsFuture(parameters: Record<string, unknown>): boolean {
  return physicsShatterFormatVersionOf(parameters) > PHYSICS_SHATTER_FORMAT_VERSION;
}

/**
 * Upgrades stored parameters of a known older format to the current one. Add a
 * case per old version that rewrites its keys; version 1 is current.
 *
 * @param parameters Stored parameters of a version this editor knows.
 * @returns Parameters in the current format.
 */
export function physicsShatterFormatMigrate(parameters: Record<string, unknown>): Record<string, unknown> {
  switch (physicsShatterFormatVersionOf(parameters)) {
    case 1:
    default:
      return parameters;
  }
}

/**
 * Returns the parameters a Simulate writes: the bake, the key it was made under
 * and the current format version.
 *
 * @param bake Encoded bake text.
 * @param bakeKey Bake key of the run that was simulated (`run.bakeKey`, see
 *   `physicsShatterBakeKey`), so changing a simulation setting shows
 *   resimulate. A bare fracture input hash is still accepted and only goes
 *   stale on input changes.
 * @returns Parameters to merge into the step.
 */
export function physicsShatterBakeParameters(bake: string, bakeKey: string): Record<string, unknown> {
  return {
    [PHYSICS_SHATTER_BAKE_KEY]: bake,
    [PHYSICS_SHATTER_BAKE_HASH_KEY]: bakeKey,
    [PHYSICS_SHATTER_FORMAT_VERSION_KEY]: PHYSICS_SHATTER_FORMAT_VERSION,
  };
}
