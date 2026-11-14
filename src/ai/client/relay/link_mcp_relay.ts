/**
 * Answers one JSON-RPC request body forwarded by the relay.
 *
 * @param body Raw JSON-RPC request text.
 * @param fits Returns whether a response text fits into one relay message.
 * @returns Raw JSON-RPC response text, or an empty string for a notification.
 */
export type McpRelayAnswer = (body: string, fits: (response: string) => boolean) => Promise<string>;

/** Relay connection that accepts MCP for this editor. */
export interface McpRelayLink {
  /**
   * Returns the public MCP URL of a token on the configured relay.
   *
   * @param token MCP token.
   * @returns URL `https://host/<prefix>/mcp/<token>`.
   */
  mcpUrl(token: string): Promise<string>;
  /**
   * Starts accepting MCP on a token.
   *
   * @param token MCP token.
   * @param answer Answers forwarded requests.
   * @returns Resolves once the relay listens; rejects with a user-facing error.
   */
  mcpListen(token: string, answer: McpRelayAnswer): Promise<void>;
  /** Stops accepting MCP. */
  mcpUnlisten(): void;
  /**
   * Returns whether MCP is accepted.
   *
   * @returns True while listening.
   */
  mcpListening(): boolean;
}
