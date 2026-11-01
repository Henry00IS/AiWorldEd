import { NODE_PARENT_WORLD } from '@/collaboration/scene/node_collaboration_types.js';
import type { VerifyVerdict } from '@/collaboration/shared/protocol_definitions.js';

/**
 * Upper bound on walked ancestors per id, guarding against cycles in malformed
 * data.
 */
const VERIFY_COLLABORATION_DEPTH = 4096;

/**
 * Answers a relay `verify` query as the room owner: `ok` when every id in `ids`
 * exists and every id in `anc` is an ancestor of at least one of them,
 * `deleted` when an id is unknown, `invalid` otherwise.
 *
 * @param parentOf Returns the parent id of a node (world = empty), or undefined
 *   for unknown nodes.
 * @param ids Ids whose ancestors were claimed.
 * @param anc Claimed ancestor ids.
 * @returns Verdict.
 */
export function verifyCollaborationVerdict(
  parentOf: (id: string) => string | undefined,
  ids: readonly string[],
  anc: readonly string[],
): VerifyVerdict {
  const known = (id: string): boolean => parentOf(id) !== undefined;
  if (!ids.every(known) || !anc.every(known)) return 'deleted';
  const ancestors = verifyCollaborationAncestors(parentOf, ids);
  return anc.every((id) => ancestors.has(id)) ? 'ok' : 'invalid';
}

/**
 * Collects every ancestor of a set of nodes, walking each shared part of the
 * hierarchy once.
 *
 * @param parentOf Returns the parent id of a node, or undefined for unknown
 *   nodes.
 * @param ids Node ids.
 * @returns Ancestor ids without the world.
 */
export function verifyCollaborationAncestors(
  parentOf: (id: string) => string | undefined,
  ids: readonly string[],
): Set<string> {
  const ancestors = new Set<string>();
  for (const id of ids) {
    let current = parentOf(id);
    let depth = 0;
    while (current !== undefined && current !== NODE_PARENT_WORLD && !ancestors.has(current)) {
      if (depth++ >= VERIFY_COLLABORATION_DEPTH) break;
      ancestors.add(current);
      current = parentOf(current);
    }
  }
  return ancestors;
}

/**
 * Parses the ids of an untrusted `verify` query.
 *
 * @param value Untrusted list.
 * @returns String ids, or null when the list is malformed.
 */
export function verifyCollaborationIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value as string[];
}

/**
 * Explains why the room owner did not confirm a lock or move.
 *
 * @param why Relay detail: invalid, deleted, owner_timeout, owner_left or
 *   rate_limited.
 * @returns Phrase for a status or tool message.
 */
export function verifyCollaborationReason(why: string): string {
  if (why === 'deleted') return 'the room owner no longer has an object or container involved (it was deleted)';
  if (why === 'owner_timeout') return 'the room owner did not confirm the containers in time';
  if (why === 'owner_left') return 'the room owner left before confirming the containers';
  if (why === 'rate_limited') return 'too many container checks at once, try again in a moment';
  return 'the room owner did not confirm the containers (the hierarchy may have just changed)';
}
