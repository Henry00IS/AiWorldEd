import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { McpToolDefinition } from '@/ai/shared/mcp_tool_definition.js';

/** The editor as seen by an MCP host: it lists its tools and runs them. */
export interface McpEditorEndpoint {
  /**
   * Lists every tool the editor currently offers, in catalog order.
   *
   * @returns Tool definitions.
   */
  toolsList(): Promise<McpToolDefinition[]>;

  /**
   * Runs one named tool.
   *
   * @param name Tool name.
   * @param args Tool arguments.
   * @returns Tool result envelope.
   */
  toolCall(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
}
