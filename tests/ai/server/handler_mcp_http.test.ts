import { describe, it, expect } from 'vitest';
import { handleMcpHttpRequest } from '@/ai/server/handler_mcp_http.js';
import type { EditorToolInvoker } from '@/ai/server/mcp_tool_dispatch.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

const MCP_ENDPOINT_URL = 'http://127.0.0.1:18765/mcp';

/**
 * Builds an HTTP request for the MCP endpoint.
 *
 * @param method HTTP method.
 * @param origin Optional Origin header value.
 * @param body Optional request body string.
 * @returns Request.
 */
function buildRequest(method: string, origin: string | null, body?: string): Request {
  const headers = new Headers();
  if (origin !== null) {
    headers.set('origin', origin);
  }
  if (body === undefined) {
    return new Request(MCP_ENDPOINT_URL, { method, headers });
  }
  headers.set('content-type', 'application/json');
  return new Request(MCP_ENDPOINT_URL, { method, headers, body });
}

/** Editor tool invoker that records the last call for assertions. */
function buildRecordingInvoker(): {
  invoker: EditorToolInvoker;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const invoker: EditorToolInvoker = async (name, args): Promise<McpToolResult> => {
    calls.push({ name, args });
    return { ok: true, message: `Invoked ${name}` };
  };
  return { invoker, calls };
}

/**
 * Extracts the access-control-allow-headers value, or null when absent.
 *
 * @param response Response to inspect.
 * @returns Header value.
 */
function readAllowedHeaders(response: Response): string | null {
  return response.headers.get('access-control-allow-headers');
}

/**
 * Asserts the response carries every MCP protocol header in the CORS allow
 * list.
 *
 * @param response Response to inspect.
 */
function expectMcpCorsHeadersPresent(response: Response): void {
  const allowed = readAllowedHeaders(response);
  expect(allowed).not.toBeNull();
  expect(allowed).toContain('content-type');
  expect(allowed).toContain('mcp-protocol-version');
  expect(allowed).toContain('mcp-session-id');
  expect(allowed).toContain('last-event-id');
}

describe('handler_mcp_http', () => {
  it('answers CORS preflight with 204 and allows every MCP protocol header', async () => {
    const { invoker } = buildRecordingInvoker();
    const response = await handleMcpHttpRequest(buildRequest('OPTIONS', null), invoker);
    expect(response.status).toBe(204);
    expectMcpCorsHeadersPresent(response);
  });

  it('allows the preflight for a loopback browser origin', async () => {
    const { invoker } = buildRecordingInvoker();
    const response = await handleMcpHttpRequest(buildRequest('OPTIONS', 'http://127.0.0.1:8081'), invoker);
    expect(response.status).toBe(204);
    expectMcpCorsHeadersPresent(response);
  });

  it('returns 403 when the Origin is not a loopback origin', async () => {
    const { invoker } = buildRecordingInvoker();
    const response = await handleMcpHttpRequest(buildRequest('GET', 'https://example.com'), invoker);
    expect(response.status).toBe(403);
  });

  it('answers a JSON-RPC notification with 202 and the MCP CORS headers', async () => {
    const { invoker } = buildRecordingInvoker();
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const response = await handleMcpHttpRequest(buildRequest('POST', null, body), invoker);
    expect(response.status).toBe(202);
    expectMcpCorsHeadersPresent(response);
  });

  it('answers initialize and carries the MCP CORS headers on the response', async () => {
    const { invoker } = buildRecordingInvoker();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const response = await handleMcpHttpRequest(buildRequest('POST', null, body), invoker);
    expect(response.status).toBe(200);
    expectMcpCorsHeadersPresent(response);
    const payload = (await response.json()) as {
      jsonrpc: string;
      id: number | string;
      result: { protocolVersion: string };
    };
    expect(payload.jsonrpc).toBe('2.0');
    expect(payload.id).toBe(1);
    expect(payload.result.protocolVersion).toBeTruthy();
  });

  it('forwards tools/call to the editor invoker', async () => {
    const { invoker, calls } = buildRecordingInvoker();
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_solid_models', arguments: {} },
    });
    const response = await handleMcpHttpRequest(buildRequest('POST', null, body), invoker);
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('list_solid_models');
  });

  it('rejects malformed JSON bodies with 400', async () => {
    const { invoker } = buildRecordingInvoker();
    const response = await handleMcpHttpRequest(buildRequest('POST', null, '{not json'), invoker);
    expect(response.status).toBe(400);
  });

  it('answers unknown paths with 404', async () => {
    const { invoker } = buildRecordingInvoker();
    const response = await handleMcpHttpRequest(
      new Request('http://127.0.0.1:18765/other', { method: 'GET' }),
      invoker,
    );
    expect(response.status).toBe(404);
  });
});
