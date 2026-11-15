import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { McpToolDefinition } from '@/ai/shared/mcp_tool_definition.js';

/** One MCP tool the editor offers: its listing plus how to run it. */
export interface McpTool extends McpToolDefinition {
  /**
   * True when the tool may change the scene, the selection or the history, so
   * it runs through the collaboration guard inside a shared room.
   */
  mutates: boolean;
  /**
   * Runs the tool.
   *
   * @param args Tool arguments.
   * @returns Tool result envelope.
   */
  run(args: Record<string, unknown>): McpToolResult;
}
