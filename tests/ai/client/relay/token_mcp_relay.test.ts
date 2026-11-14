import { describe, expect, it } from 'vitest';
import {
  MCP_RELAY_TOKEN_KEY,
  MCP_RELAY_TOKEN_PATTERN,
  mcpRelayTokenGenerate,
  mcpRelayTokenGet,
  mcpRelayTokenRegenerate,
} from '@/ai/client/relay/token_mcp_relay.js';

/**
 * Creates an in-memory settings storage.
 *
 * @returns Storage.
 */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

describe('browser MCP token', () => {
  it('generates distinct 64 character base64url tokens', () => {
    const tokens = new Set(Array.from({ length: 32 }, () => mcpRelayTokenGenerate()));
    expect(tokens.size).toBe(32);
    for (const token of tokens) expect(token).toMatch(MCP_RELAY_TOKEN_PATTERN);
  });

  it('creates the token once and reuses it until regenerated', () => {
    const storage = memoryStorage();
    const first = mcpRelayTokenGet(storage);
    expect(storage.getItem(MCP_RELAY_TOKEN_KEY)).toBe(first);
    expect(mcpRelayTokenGet(storage)).toBe(first);
    const next = mcpRelayTokenRegenerate(storage);
    expect(next).not.toBe(first);
    expect(mcpRelayTokenGet(storage)).toBe(next);
  });

  it('replaces a stored token that is not exactly 64 base64url characters', () => {
    const storage = memoryStorage();
    for (const bad of ['short', 'A'.repeat(63), 'A'.repeat(65), `${'A'.repeat(63)}=`, `${'A'.repeat(63)}/`]) {
      storage.setItem(MCP_RELAY_TOKEN_KEY, bad);
      const token = mcpRelayTokenGet(storage);
      expect(token).not.toBe(bad);
      expect(token).toMatch(MCP_RELAY_TOKEN_PATTERN);
    }
  });
});
