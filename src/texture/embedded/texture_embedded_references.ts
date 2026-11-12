import { textureEmbeddedIdIs } from './texture_embedded_id.js';

/** Most objects one search visits before it gives up. */
const TEXTURE_EMBEDDED_REFERENCES_VISITS_MAXIMUM = 2_000_000;

/** Keys never followed: links up to the scene, which is searched on its own. */
const TEXTURE_EMBEDDED_REFERENCES_SKIPPED = new Set(['parent']);

/**
 * Finds the embedded texture ids ("embedded:<sha256>.<ext>") anywhere in some
 * values, such as undo and redo entries with the objects they keep: every
 * string that is such an id counts. Binary data, images and page elements are
 * not searched.
 *
 * @param roots Values to search.
 * @returns Ids found, or null when the values were too large to search.
 */
export function textureEmbeddedIdsIn(roots: Iterable<unknown>): Set<string> | null {
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  const pending: unknown[] = [...roots];
  for (let visits = 0; pending.length > 0; visits++) {
    if (visits > TEXTURE_EMBEDDED_REFERENCES_VISITS_MAXIMUM) return null;
    const value = pending.pop();
    if (typeof value === 'string') {
      if (textureEmbeddedIdIs(value)) ids.add(value);
    } else if (textureEmbeddedReferencesSearched(value) && !seen.has(value)) {
      seen.add(value);
      textureEmbeddedReferencesChildren(value, pending);
    }
  }
  return ids;
}

/**
 * Tells whether a value may hold ids.
 *
 * @param value Value.
 * @returns True for objects other than binary data, images and elements.
 */
function textureEmbeddedReferencesSearched(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob) return false;
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) return false;
  return typeof Node === 'undefined' || !(value instanceof Node);
}

/**
 * Queues the values an object holds.
 *
 * @param value Object.
 * @param pending Queue.
 */
function textureEmbeddedReferencesChildren(value: object, pending: unknown[]): void {
  if (value instanceof Map) value.forEach((item, key) => pending.push(key, item));
  else if (value instanceof Set) value.forEach((item) => pending.push(item));
  else
    for (const [key, item] of Object.entries(value))
      if (!TEXTURE_EMBEDDED_REFERENCES_SKIPPED.has(key)) pending.push(item);
}
