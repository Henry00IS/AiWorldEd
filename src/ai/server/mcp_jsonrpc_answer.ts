import {
  isJsonRpcNotification,
  jsonRpcError,
  jsonRpcSuccess,
  parseJsonRpcRequest,
  type JsonRpcResponse,
} from './mcp_jsonrpc.js';
import { buildMcpInitializeResult } from './mcp_initialize.js';
import { listMcpTools } from './registry_mcp_tool.js';
import { dispatchMcpToolCall, type EditorToolInvoker } from './mcp_tool_dispatch.js';

/**
 * Answer to one JSON-RPC request body: HTTP status and response, or null for a
 * notification.
 */
export interface McpJsonRpcAnswer {
  status: 200 | 202 | 400;
  response: JsonRpcResponse | null;
}

/**
 * Answers one raw JSON-RPC request body with the MCP methods of the editor.
 *
 * @param bodyText Raw request body text.
 * @param invoker Editor tool invoker.
 * @returns Status and JSON-RPC response; a null response for notifications.
 */
export async function mcpJsonRpcAnswer(bodyText: string, invoker: EditorToolInvoker): Promise<McpJsonRpcAnswer> {
  const body = mcpJsonRpcBodyParse(bodyText);
  if (body === undefined) return { status: 400, response: jsonRpcError(null, -32700, 'Parse error') };
  const rpcRequest = parseJsonRpcRequest(body);
  if (!rpcRequest) return { status: 400, response: jsonRpcError(null, -32600, 'Invalid Request') };
  if (isJsonRpcNotification(rpcRequest)) return { status: 202, response: null };
  const response = await mcpJsonRpcRoute(rpcRequest.method, rpcRequest.params, rpcRequest.id ?? null, invoker);
  return { status: 200, response };
}

/**
 * Parses a request body as JSON.
 *
 * @param bodyText Raw request body text.
 * @returns Parsed value, or undefined when the text is not JSON.
 */
function mcpJsonRpcBodyParse(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Routes a JSON-RPC method to MCP handlers.
 *
 * @param method Method name.
 * @param params Method params.
 * @param id Request id.
 * @param invoker Editor tool invoker.
 * @returns JSON-RPC response.
 */
async function mcpJsonRpcRoute(
  method: string,
  params: unknown,
  id: string | number | null,
  invoker: EditorToolInvoker,
): Promise<JsonRpcResponse> {
  if (method === 'initialize') {
    return jsonRpcSuccess(id, buildMcpInitializeResult());
  }
  if (method === 'tools/list') {
    return jsonRpcSuccess(id, listMcpTools());
  }
  if (method === 'tools/call') {
    const result = await dispatchMcpToolCall(params, invoker);
    return jsonRpcSuccess(id, result);
  }
  if (method === 'ping') {
    return jsonRpcSuccess(id, {});
  }
  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}
