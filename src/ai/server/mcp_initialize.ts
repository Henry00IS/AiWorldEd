import { APPLICATION_VERSION } from '@/application_identity.js';
import { MCP_PROTOCOL_VERSION, MCP_SERVER_NAME } from '@/ai/shared/mcp_constants.js';
import { MCP_SERVER_INSTRUCTIONS } from '@/ai/shared/mcp_instructions.js';

/** MCP initialize result payload. */
export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: { tools: Record<string, never> };
  serverInfo: { name: string; version: string };
  instructions: string;
}

/**
 * Builds the MCP initialize result advertised to clients.
 *
 * @returns Initialize result payload.
 */
export function buildMcpInitializeResult(): McpInitializeResult {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: APPLICATION_VERSION,
    },
    instructions: MCP_SERVER_INSTRUCTIONS,
  };
}
