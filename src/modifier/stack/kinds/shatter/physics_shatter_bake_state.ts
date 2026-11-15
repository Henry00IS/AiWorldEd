import type { PhysicsShatterPieceTransform } from './physics_shatter_transform.js';

/** Parameter key of the baked piece transforms (base64 text). */
export const PHYSICS_SHATTER_BAKE_KEY = 'bake';

/**
 * Parameter key of the bake key the bake was made under: the fracture input
 * hash plus the simulation settings (see physicsShatterBakeKey).
 */
export const PHYSICS_SHATTER_BAKE_HASH_KEY = 'bakeHash';

/** Longest bake text kept, enough for the most pieces the inspector allows. */
export const PHYSICS_SHATTER_BAKE_MAX_LENGTH = 262144;

/**
 * Feedback while the stored rubble no longer matches the inputs or the
 * simulation settings.
 */
export const PHYSICS_SHATTER_BAKE_STALE =
  'The input or the blast settings changed since the last simulation: press Simulate to update the rubble. Pieces show unbroken until then.';

/**
 * Turns stored bake text into one transform per piece, or null when the text
 * does not hold that many pieces.
 */
export type PhysicsShatterBakeDecoder = (bake: string, pieceCount: number) => PhysicsShatterPieceTransform[] | null;

/**
 * Whether a modifier has rubble stored and whether it still fits; unsupported
 * when the volume was saved by a newer editor.
 */
export type PhysicsShatterBakeStatus = 'unsimulated' | 'baked' | 'stale' | 'unsupported';

/** Bake status with the transforms to apply. */
export interface PhysicsShatterBakeState {
  /** Bake status. */
  status: PhysicsShatterBakeStatus;
  /** One transform per piece while baked, else null. */
  transforms: PhysicsShatterPieceTransform[] | null;
}

/**
 * Reads the stored bake and checks it against the current fracture and
 * simulation settings. A bake stored under the bare input hash, as Simulate
 * wrote it before bake keys, is still read as matching its fracture.
 *
 * @param parameters Normalized parameters.
 * @param keys Current bake key and fracture input hash.
 * @param keys.bakeKey Bake key of the current inputs and simulation settings.
 * @param keys.inputHash Hash of the current fracture inputs.
 * @param pieceCount Number of pieces of the current fracture.
 * @param decode Bake decoder.
 * @returns Status and transforms.
 */
export function physicsShatterBakeStateRead(
  parameters: Record<string, unknown>,
  keys: { bakeKey: string; inputHash: string },
  pieceCount: number,
  decode: PhysicsShatterBakeDecoder,
): PhysicsShatterBakeState {
  const bake = parameters[PHYSICS_SHATTER_BAKE_KEY];
  if (typeof bake !== 'string' || bake.length === 0) return { status: 'unsimulated', transforms: null };
  const stored = parameters[PHYSICS_SHATTER_BAKE_HASH_KEY];
  if (stored !== keys.bakeKey && stored !== keys.inputHash) return { status: 'stale', transforms: null };
  const transforms = decode(bake, pieceCount);
  return transforms ? { status: 'baked', transforms } : { status: 'stale', transforms: null };
}

/**
 * Copies the bake keys into normalized parameters when they are well formed.
 *
 * @param input Stored parameters.
 * @param output Normalized parameters receiving the bake keys.
 */
export function physicsShatterBakeKeep(input: Record<string, unknown>, output: Record<string, unknown>): void {
  const bake = input[PHYSICS_SHATTER_BAKE_KEY];
  const hash = input[PHYSICS_SHATTER_BAKE_HASH_KEY];
  const bakeValid =
    typeof bake === 'string' && bake.length <= PHYSICS_SHATTER_BAKE_MAX_LENGTH && /^[A-Za-z0-9+/=]*$/.test(bake);
  output[PHYSICS_SHATTER_BAKE_KEY] = bakeValid ? bake : '';
  output[PHYSICS_SHATTER_BAKE_HASH_KEY] = typeof hash === 'string' && /^[0-9a-f]{16}$/.test(hash) ? hash : '';
}
