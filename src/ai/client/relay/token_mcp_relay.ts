import type { McpSettingsStorage } from '@/ai/client/settings_mcp.js';

/** Settings key of the browser MCP token. */
export const MCP_RELAY_TOKEN_KEY = 'aiworlded.mcp.relayToken';
/** A browser MCP token: exactly 64 base64url characters (48 random bytes). */
export const MCP_RELAY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{64}$/;
/** Random bytes of a token (64 base64url characters). */
const MCP_RELAY_TOKEN_BYTES = 48;

/**
 * Creates a new random token: 48 bytes from crypto.getRandomValues as
 * base64url.
 *
 * @returns 64 character token.
 */
export function mcpRelayTokenGenerate(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(MCP_RELAY_TOKEN_BYTES));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_');
}

/**
 * Returns the stored token, creating and storing one when none is valid.
 *
 * @param storage Settings storage.
 * @returns 64 character token.
 */
export function mcpRelayTokenGet(storage: McpSettingsStorage | null): string {
  const stored = storage?.getItem(MCP_RELAY_TOKEN_KEY) ?? '';
  return MCP_RELAY_TOKEN_PATTERN.test(stored) ? stored : mcpRelayTokenRegenerate(storage);
}

/**
 * Replaces the stored token with a new one.
 *
 * @param storage Settings storage.
 * @returns New 64 character token.
 */
export function mcpRelayTokenRegenerate(storage: McpSettingsStorage | null): string {
  const token = mcpRelayTokenGenerate();
  storage?.setItem(MCP_RELAY_TOKEN_KEY, token);
  return token;
}
