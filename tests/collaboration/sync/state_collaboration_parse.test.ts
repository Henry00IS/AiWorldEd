import { describe, expect, it } from 'vitest';
import { stateCollaborationParse } from '@/collaboration/sync/state_collaboration_parse.js';
import { orderKeysInitial } from '@/collaboration/scene/key_collaboration_order.js';

/**
 * Builds a valid entry envelope.
 *
 * @returns Envelope.
 */
function envelope(): Record<string, unknown> {
  return { id: 'node-a', kind: 'entry', parent: '', key: orderKeysInitial(1)[0], data: {} };
}

/** Envelope validation of relayed node states. */
describe('state_collaboration_parse', () => {
  it('accepts a valid entry state', () => {
    expect(stateCollaborationParse(envelope())).not.toBeNull();
  });

  it('rejects malformed envelopes', () => {
    const cases: Record<string, unknown>[] = [
      { ...envelope(), id: 'bad id with spaces' },
      { ...envelope(), kind: 'script' },
      { ...envelope(), parent: 7 },
      { ...envelope(), key: '' },
      { ...envelope(), data: null },
      { ...envelope(), kind: 'brush' },
    ];
    cases.forEach((value) => expect(stateCollaborationParse(value)).toBeNull());
    expect(stateCollaborationParse('text')).toBeNull();
  });

  it('requires a model for brush states', () => {
    expect(stateCollaborationParse({ ...envelope(), kind: 'brush', model: 'model-a' })).not.toBeNull();
  });
});
