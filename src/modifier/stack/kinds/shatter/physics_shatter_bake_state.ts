import type { PhysicsShatterPieceTransform } from './physics_shatter_transform.js';

/** Parameter key of the baked piece transforms (base64 text). */
export const PHYSICS_SHATTER_BAKE_KEY = 'bake';

/** Parameter key of the fracture input hash the bake was made from. */
export const PHYSICS_SHATTER_BAKE_HASH_KEY = 'bakeHash';

/** Longest bake text kept, enough for the most pieces the inspector allows. */
export const PHYSICS_SHATTER_BAKE_MAX_LENGTH = 262144;

/** Feedback while the stored rubble no longer matches the inputs. */
export const PHYSICS_SHATTER_BAKE_STALE =
  'The input changed since the last simulation: press Simulate to update the rubble. Pieces show unbroken until then.';

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
 * Reads the stored bake and checks it against the current fracture.
 *
 * @param parameters Normalized parameters.
 * @param inputHash Hash of the current fracture inputs.
 * @param pieceCount Number of pieces of the current fracture.
 * @param decode Bake decoder.
 * @returns Status and transforms.
 */
export function physicsShatterBakeStateRead(
  parameters: Record<string, unknown>,
  inputHash: string,
  pieceCount: number,
  decode: PhysicsShatterBakeDecoder,
): PhysicsShatterBakeState {
  const bake = parameters[PHYSICS_SHATTER_BAKE_KEY];
  if (typeof bake !== 'string' || bake.length === 0) return { status: 'unsimulated', transforms: null };
  if (parameters[PHYSICS_SHATTER_BAKE_HASH_KEY] !== inputHash) return { status: 'stale', transforms: null };
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
