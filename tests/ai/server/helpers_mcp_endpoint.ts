import type { McpEditorEndpoint } from '@/ai/server/mcp_editor_endpoint.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { McpToolDefinition } from '@/ai/shared/mcp_tool_definition.js';

/**
 * Builds an editor endpoint for host tests from a tool call handler.
 *
 * @param toolCall Handler that answers tools/call.
 * @param tools Definitions answered by tools/list.
 * @returns Endpoint.
 */
export function mcpEndpointFake(
  toolCall: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>,
  tools: McpToolDefinition[] = [],
): McpEditorEndpoint {
  return { toolsList: async () => tools, toolCall };
}
