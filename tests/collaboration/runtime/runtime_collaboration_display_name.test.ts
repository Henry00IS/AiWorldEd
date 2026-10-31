import { describe, expect, it } from 'vitest';
import { runtimeCollaborationDisplayName } from '@/collaboration/runtime/runtime_collaboration_client.js';

describe('runtime collaboration display name field', () => {
  it('sends a trimmed name to relays with presence support', () => {
    expect(runtimeCollaborationDisplayName('  Henry ', { presencePerSecond: 10 })).toEqual({ displayName: 'Henry' });
  });

  it('leaves the field out when the name is blank or the relay predates names', () => {
    expect(runtimeCollaborationDisplayName('   ', { presencePerSecond: 10 })).toEqual({});
    expect(runtimeCollaborationDisplayName('Henry', { presencePerSecond: 0 })).toEqual({});
  });
});
