import { orderKeyValid } from '@/collaboration/scene/key_collaboration_order.js';
import { nodeIdValid } from '@/collaboration/scene/node_collaboration_identity.js';
import type { NodeCollaborationKind, NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';

const STATE_KINDS: ReadonlySet<string> = new Set<NodeCollaborationKind>(['entry', 'brush', 'solidGroup']);

/**
 * Validates the envelope of a relayed node state. Payload fields are checked
 * by the applier, which ignores states it cannot apply.
 *
 * @param value Untrusted value.
 * @returns State, or null when the envelope is invalid.
 */
export function stateCollaborationParse(value: unknown): NodeCollaborationState | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = record['id'];
  const kind = record['kind'];
  const parent = record['parent'];
  const model = record['model'];
  const data = record['data'];
  if (typeof id !== 'string' || !nodeIdValid(id)) return null;
  if (typeof kind !== 'string' || !STATE_KINDS.has(kind)) return null;
  if (typeof parent !== 'string' || (parent !== '' && !nodeIdValid(parent))) return null;
  if (!orderKeyValid(record['key'])) return null;
  if (model !== undefined && (typeof model !== 'string' || !nodeIdValid(model))) return null;
  if (kind !== 'entry' && model === undefined) return null;
  if (typeof data !== 'object' || data === null) return null;
  return value as NodeCollaborationState;
}
