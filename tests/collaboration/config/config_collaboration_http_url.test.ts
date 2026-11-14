import { describe, expect, it } from 'vitest';
import { configCollaborationHttpUrl } from '@/collaboration/config/config_collaboration_http_url.js';
import { hostCollaborationTransferUrl } from '@/collaboration/transfer/host_collaboration_transfer.js';

describe('configCollaborationHttpUrl', () => {
  it('serves MCP next to transfer links under the live and dev relay prefixes', () => {
    const token = 'T'.repeat(64);
    expect(configCollaborationHttpUrl('wss://aiworlded.00labs.net/ws', 'mcp', token)).toBe(
      `https://aiworlded.00labs.net/ws/mcp/${token}`,
    );
    expect(configCollaborationHttpUrl('wss://aiworlded.00labs.net/wsdev/', 'mcp', token)).toBe(
      `https://aiworlded.00labs.net/wsdev/mcp/${token}`,
    );
    expect(hostCollaborationTransferUrl('wss://aiworlded.00labs.net/wsdev', 'link')).toBe(
      'https://aiworlded.00labs.net/wsdev/transfer/link',
    );
  });

  it('maps ws to http and drops query and fragment', () => {
    expect(configCollaborationHttpUrl('ws://localhost:8787/ws?x=1#y', 'mcp', 'abc')).toBe(
      'http://localhost:8787/ws/mcp/abc',
    );
  });
});
