/** Pattern of ids accepted by the relay. */
const NODE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Prefix of hashed brush wire ids. */
const NODE_BRUSH_HASH_PREFIX = 'b.';

/**
 * Returns whether a string is a valid relay object id.
 *
 * @param value Candidate id.
 * @returns True when the relay accepts the id.
 */
export function nodeIdValid(value: string): boolean {
  return NODE_ID_PATTERN.test(value);
}

/**
 * Computes a 32-bit FNV-1a hash.
 *
 * @param text Input text.
 * @param seed Initial hash state.
 * @returns Unsigned 32-bit hash.
 */
function nodeHashFnv(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Returns the wire id of a brush. Brush ids already prefixed with their model
 * root id are globally unique and used directly; others are hashed together
 * with the root id.
 *
 * @param rootId Uuid of the owning solid model root.
 * @param brushId Local brush instance id.
 * @returns Relay-compatible, room-unique brush id.
 */
export function nodeBrushWireId(rootId: string, brushId: string): string {
  if (brushId.startsWith(rootId) && nodeIdValid(brushId)) return brushId;
  const source = `${rootId}\n${brushId}`;
  const high = nodeHashFnv(source, 0x811c9dc5).toString(16).padStart(8, '0');
  const low = nodeHashFnv(source, 0x050c5d1f).toString(16).padStart(8, '0');
  return `${NODE_BRUSH_HASH_PREFIX}${high}${low}`;
}
