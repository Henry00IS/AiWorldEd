import { orderKeysBetween } from '@/collaboration/scene/key_collaboration_order.js';

/** One sibling handed to key assignment, in local scene order. */
export interface KeysCollaborationSibling {
  id: string;
  fixed: boolean;
  previousKey: string | null;
}

/** Result of assigning order keys to one sibling list. */
export interface KeysCollaborationAssignment {
  keys: Map<string, string>;
  violated: boolean;
}

/**
 * Assigns order keys to the siblings of one parent. Fixed siblings (not held
 * locally) keep their agreed keys; held siblings keep theirs when they still
 * fit, otherwise they receive fresh keys between their neighbours.
 *
 * @param siblings Children in local scene order.
 * @returns Keys per id and whether fixed siblings appear out of order.
 */
export function keysCollaborationAssign(siblings: readonly KeysCollaborationSibling[]): KeysCollaborationAssignment {
  const keys = new Map<string, string>();
  let violated = false;
  let low: string | null = null;
  let start = 0;
  siblings.forEach((sibling, index) => {
    if (!sibling.fixed || sibling.previousKey === null) return;
    if (low !== null && sibling.previousKey <= low) violated = true;
    keysCollaborationRun(siblings.slice(start, index), low, sibling.previousKey, keys);
    keys.set(sibling.id, sibling.previousKey);
    low = low !== null && sibling.previousKey <= low ? low : sibling.previousKey;
    start = index + 1;
  });
  keysCollaborationRun(siblings.slice(start), low, null, keys);
  return { keys, violated };
}

/**
 * Assigns keys to a run of held siblings between two fixed neighbours,
 * keeping existing keys greedily and filling the gaps evenly.
 *
 * @param run Held siblings in order.
 * @param low Key of the fixed sibling before the run, or null.
 * @param high Key of the fixed sibling after the run, or null.
 * @param keys Receives the assigned keys.
 */
function keysCollaborationRun(
  run: readonly KeysCollaborationSibling[],
  low: string | null,
  high: string | null,
  keys: Map<string, string>,
): void {
  const kept = keysCollaborationKept(run, low, high);
  let gapStart = 0;
  let gapLow = low;
  run.forEach((sibling, index) => {
    const key = kept.get(sibling.id);
    if (key === undefined) return;
    keysCollaborationFill(run.slice(gapStart, index), gapLow, key, keys);
    keys.set(sibling.id, key);
    gapLow = key;
    gapStart = index + 1;
  });
  keysCollaborationFill(run.slice(gapStart), gapLow, high, keys);
}

/**
 * Picks the held siblings whose previous keys stay strictly ascending inside
 * the bounds.
 *
 * @param run Held siblings in order.
 * @param low Lower bound, or null.
 * @param high Upper bound, or null.
 * @returns Kept keys per id.
 */
function keysCollaborationKept(
  run: readonly KeysCollaborationSibling[],
  low: string | null,
  high: string | null,
): Map<string, string> {
  const kept = new Map<string, string>();
  let last = low;
  for (const sibling of run) {
    const key = sibling.previousKey;
    if (key === null || (last !== null && key <= last) || (high !== null && key >= high)) continue;
    kept.set(sibling.id, key);
    last = key;
  }
  return kept;
}

/**
 * Gives fresh keys to a gap of siblings.
 *
 * @param gap Siblings without a kept key.
 * @param low Lower bound, or null.
 * @param high Upper bound, or null.
 * @param keys Receives the assigned keys.
 */
function keysCollaborationFill(
  gap: readonly KeysCollaborationSibling[],
  low: string | null,
  high: string | null,
  keys: Map<string, string>,
): void {
  if (gap.length === 0) return;
  const fresh = orderKeysBetween(low, high, gap.length);
  gap.forEach((sibling, index) => keys.set(sibling.id, fresh[index] ?? ''));
}
