import {
  orderCompare,
  orderKeysBetween,
  orderLongestIncreasingPositions,
} from '@/collaboration/scene/key_collaboration_order.js';

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

/** Position of a sibling in the agreed (key, id) order. */
interface KeysCollaborationBound {
  key: string;
  id: string;
}

/** Working state of one assignment. */
interface KeysCollaborationWork {
  keys: Map<string, string>;
  violated: boolean;
}

/**
 * Assigns order keys to the siblings of one parent. Fixed siblings (not held
 * locally) keep their agreed keys; held siblings keep theirs when they still
 * fit in (key, id) order, otherwise they receive fresh keys between their
 * neighbours. Comparing by (key, id) like the placement does lets members that
 * created siblings with the same key concurrently keep them, so the keys settle
 * instead of being rewritten back and forth.
 *
 * @param siblings Children in local scene order.
 * @returns Keys per id and whether fixed siblings appear out of order.
 */
export function keysCollaborationAssign(siblings: readonly KeysCollaborationSibling[]): KeysCollaborationAssignment {
  const work: KeysCollaborationWork = { keys: new Map(), violated: false };
  let low: KeysCollaborationBound | null = null;
  let start = 0;
  siblings.forEach((sibling, index) => {
    if (!sibling.fixed || sibling.previousKey === null) return;
    const bound: KeysCollaborationBound = { key: sibling.previousKey, id: sibling.id };
    const ordered = keysCollaborationAfter(bound, low);
    if (!ordered) work.violated = true;
    keysCollaborationRun(siblings.slice(start, index), low, bound, work);
    work.keys.set(sibling.id, sibling.previousKey);
    if (ordered) low = bound;
    start = index + 1;
  });
  keysCollaborationRun(siblings.slice(start), low, null, work);
  return work;
}

/**
 * Returns whether a position comes strictly after a lower bound.
 *
 * @param position Position to test.
 * @param low Lower bound, or null for none.
 * @returns True when the position is after the bound.
 */
function keysCollaborationAfter(position: KeysCollaborationBound, low: KeysCollaborationBound | null): boolean {
  return low === null || orderCompare(position.key, position.id, low.key, low.id) > 0;
}

/**
 * Returns whether a position fits strictly between two bounds.
 *
 * @param position Position to test.
 * @param low Lower bound, or null.
 * @param high Upper bound, or null.
 * @returns True when the position is inside the bounds.
 */
function keysCollaborationInside(
  position: KeysCollaborationBound,
  low: KeysCollaborationBound | null,
  high: KeysCollaborationBound | null,
): boolean {
  return keysCollaborationAfter(position, low) && (high === null || keysCollaborationAfter(high, position));
}

/**
 * Assigns keys to a run of held siblings between two fixed neighbours, keeping
 * existing keys greedily and filling the gaps evenly.
 *
 * @param run Held siblings in order.
 * @param low Position of the fixed sibling before the run, or null.
 * @param high Position of the fixed sibling after the run, or null.
 * @param work Receives the assigned keys.
 */
function keysCollaborationRun(
  run: readonly KeysCollaborationSibling[],
  low: KeysCollaborationBound | null,
  high: KeysCollaborationBound | null,
  work: KeysCollaborationWork,
): void {
  const kept = keysCollaborationKept(run, low, high);
  let gapStart = 0;
  let gapLow = low;
  run.forEach((sibling, index) => {
    const key = kept.get(sibling.id);
    if (key === undefined) return;
    const bound: KeysCollaborationBound = { key, id: sibling.id };
    keysCollaborationFill(run.slice(gapStart, index), gapLow, bound, work);
    work.keys.set(sibling.id, key);
    gapLow = bound;
    gapStart = index + 1;
  });
  keysCollaborationFill(run.slice(gapStart), gapLow, high, work);
}

/**
 * Picks the largest set of held siblings whose previous positions stay strictly
 * ascending inside the bounds, so moving one sibling re-keys only it.
 *
 * @param run Held siblings in order.
 * @param low Lower bound, or null.
 * @param high Upper bound, or null.
 * @returns Kept keys per id.
 */
function keysCollaborationKept(
  run: readonly KeysCollaborationSibling[],
  low: KeysCollaborationBound | null,
  high: KeysCollaborationBound | null,
): Map<string, string> {
  const candidates: KeysCollaborationBound[] = [];
  for (const sibling of run) {
    if (sibling.previousKey === null) continue;
    const position: KeysCollaborationBound = { key: sibling.previousKey, id: sibling.id };
    if (keysCollaborationInside(position, low, high)) candidates.push(position);
  }
  const keptPositions = orderLongestIncreasingPositions(candidates, (a, b) => keysCollaborationAfter(b, a));
  const kept = new Map<string, string>();
  candidates.forEach((candidate, position) => {
    if (keptPositions.has(position)) kept.set(candidate.id, candidate.key);
  });
  return kept;
}

/**
 * Gives fresh keys to a gap of siblings. When the bounds share one key no key
 * fits between them; the siblings then keep (or get) keys after the lower bound
 * and the list is flagged so the agreed order is restored.
 *
 * @param gap Siblings without a kept key.
 * @param low Lower bound, or null.
 * @param high Upper bound, or null.
 * @param work Receives the assigned keys.
 */
function keysCollaborationFill(
  gap: readonly KeysCollaborationSibling[],
  low: KeysCollaborationBound | null,
  high: KeysCollaborationBound | null,
  work: KeysCollaborationWork,
): void {
  if (gap.length === 0) return;
  const lowKey = low?.key ?? null;
  const collapsed = lowKey !== null && high !== null && lowKey >= high.key;
  const fresh = orderKeysBetween(lowKey, collapsed ? null : (high?.key ?? null), gap.length);
  if (collapsed) work.violated = true;
  gap.forEach((sibling, index) => {
    const key = collapsed ? (sibling.previousKey ?? fresh[index]) : fresh[index];
    work.keys.set(sibling.id, key ?? '');
  });
}
