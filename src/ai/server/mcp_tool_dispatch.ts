import type { McpImagePayload, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { McpEditorEndpoint } from './mcp_editor_endpoint.js';

/** One MCP tools/call content block (text or image). */
export type McpContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

/** MCP tools/call response body. */
export type McpToolCallResponse = { content: McpContentBlock[]; isError?: boolean };

/**
 * Handles MCP tools/call by forwarding the call to the editor, which rejects
 * unknown tool names itself.
 *
 * @param params Raw tools/call params.
 * @param endpoint Editor endpoint (usually Electrobun RPC).
 * @returns MCP tools/call result content blocks.
 */
export async function dispatchMcpToolCall(params: unknown, endpoint: McpEditorEndpoint): Promise<McpToolCallResponse> {
  const parsed = parseToolCallParams(params);
  if (!parsed) {
    return buildToolCallResponse({ ok: false, message: 'Invalid tools/call params' }, true);
  }
  const result = await endpoint.toolCall(parsed.name, parsed.arguments);
  return buildToolCallResponse(result, !result.ok);
}

/**
 * Parses tools/call params into name and arguments.
 *
 * @param params Raw params object.
 * @returns Parsed call or null.
 */
function parseToolCallParams(params: unknown): { name: string; arguments: Record<string, unknown> } | null {
  if (!params || typeof params !== 'object') return null;
  const record = params as Record<string, unknown>;
  const name = record['name'];
  if (typeof name !== 'string' || name.length === 0) return null;
  const args = record['arguments'];
  if (args === undefined || args === null) return { name, arguments: {} };
  if (typeof args !== 'object' || Array.isArray(args)) return null;
  return { name, arguments: args as Record<string, unknown> };
}

/**
 * Wraps a tool result as MCP text content plus optional image content blocks.
 *
 * @param result Tool result envelope.
 * @param isError Whether to mark the MCP call as an error.
 * @returns MCP content payload.
 */
function buildToolCallResponse(result: McpToolResult, isError: boolean): McpToolCallResponse {
  const content: McpContentBlock[] = [{ type: 'text', text: JSON.stringify(stripImagesForText(result)) }];
  appendImageContentBlocks(content, result.images);
  if (isError) {
    return { content, isError: true };
  }
  return { content };
}

/**
 * Removes image payloads from the JSON text body so base64 is not doubled.
 *
 * @param result Full tool result.
 * @returns Result without images for text serialization.
 */
function stripImagesForText(result: McpToolResult): McpToolResult {
  if (!result.images || result.images.length === 0) {
    return result;
  }
  const { images: _images, ...rest } = result;
  return rest;
}

/**
 * Appends MCP image content blocks for each image payload.
 *
 * @param content Content array to extend.
 * @param images Optional image payloads.
 */
function appendImageContentBlocks(content: McpContentBlock[], images: McpImagePayload[] | undefined): void {
  if (!images || images.length === 0) {
    return;
  }
  for (const image of images) {
    content.push({ type: 'image', data: image.data, mimeType: image.mimeType });
  }
}
