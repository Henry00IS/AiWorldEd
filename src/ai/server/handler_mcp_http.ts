import { MCP_HTTP_PATH } from '@/ai/shared/mcp_constants.js';
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
 * Handles one HTTP request against the MCP endpoint.
 *
 * @param request Incoming HTTP request.
 * @param invoker Editor tool invoker.
 * @returns HTTP response.
 */
export async function handleMcpHttpRequest(request: Request, invoker: EditorToolInvoker): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== MCP_HTTP_PATH) {
    return jsonResponse({ error: 'Not found' }, 404);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (!isOriginAllowed(request.headers.get('origin'))) {
    return jsonResponse({ error: 'Origin not allowed' }, 403);
  }
  if (request.method === 'GET') {
    return jsonResponse({ ok: true, message: 'AiWorldEd MCP endpoint. Use POST for JSON-RPC.' });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  return handleMcpPost(request, invoker);
}

/**
 * Handles a JSON-RPC POST body.
 *
 * @param request Incoming POST request.
 * @param invoker Editor tool invoker.
 * @returns HTTP response.
 */
async function handleMcpPost(request: Request, invoker: EditorToolInvoker): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(jsonRpcError(null, -32700, 'Parse error'), 400);
  }
  const rpcRequest = parseJsonRpcRequest(body);
  if (!rpcRequest) {
    return jsonResponse(jsonRpcError(null, -32600, 'Invalid Request'), 400);
  }
  if (isJsonRpcNotification(rpcRequest)) {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }
  const response = await routeJsonRpc(rpcRequest.method, rpcRequest.params, rpcRequest.id ?? null, invoker);
  return jsonResponse(response);
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
async function routeJsonRpc(
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

/**
 * Allows missing Origin (non-browser clients) and localhost origins only.
 *
 * @param origin Origin header value.
 * @returns True when allowed.
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Builds a JSON HTTP response with CORS headers.
 *
 * @param body Response body object.
 * @param status HTTP status code.
 * @returns Response.
 */
function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders(),
    },
  });
}

/**
 * CORS headers for local MCP clients.
 *
 * @returns Header record.
 */
function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, mcp-protocol-version, mcp-session-id, last-event-id',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
}
